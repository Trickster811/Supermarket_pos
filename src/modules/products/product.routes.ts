
import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";

const managerAccess = requireRoles("ADMIN", "MANAGER");

// Accept prices as decimal strings to avoid floating-point money errors.
const pricePattern = "^(0|[1-9][0-9]{0,11})(\\.[0-9]{1,2})?$";

function isPositivePrice(value: string): boolean {
  if (!new RegExp(pricePattern).test(value)) return false;
  return BigInt(value.replace(".", "")) > 0n;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function productRoutes(app: FastifyInstance) {
  // CREATE PRODUCT
  app.post(
    "/",
    {
      preHandler: [authenticate, managerAccess],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "sku",
            "name",
            "sellingMode",
            "unitOfMeasure",
            "price",
          ],
          properties: {
            sku: { type: "string", minLength: 1, maxLength: 50 },
            name: { type: "string", minLength: 1, maxLength: 150 },
            description: { type: "string", maxLength: 1000 },
            barcode: { type: ["string", "null"], maxLength: 100 },
            pluCode: { type: ["string", "null"], maxLength: 30 },
            sellingMode: { type: "string", enum: ["UNIT", "WEIGHT"] },
            unitOfMeasure: {
              type: "string",
              enum: [
                "PIECE",
                "PACKET",
                "BOTTLE",
                "BOX",
                "KG",
                "GRAM",
                "LITRE",
              ],
            },
            price: {
              type: "string",
              pattern: pricePattern,
              maxLength: 15,
            },
            categoryId: { type: ["string", "null"] },
            trackInventory: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        sku: string;
        name: string;
        description?: string;
        barcode?: string | null;
        pluCode?: string | null;
        sellingMode: "UNIT" | "WEIGHT";
        unitOfMeasure:
          | "PIECE"
          | "PACKET"
          | "BOTTLE"
          | "BOX"
          | "KG"
          | "GRAM"
          | "LITRE";
        price: string;
        categoryId?: string | null;
        trackInventory?: boolean;
      };

      const sku = body.sku.trim().toUpperCase();
      const name = body.name.trim();
      const barcode = body.barcode?.trim() || null;
      const pluCode = body.pluCode?.trim() || null;

      if (!sku || !name) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "SKU and product name cannot be empty",
        });
      }

      if (!isPositivePrice(body.price)) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Price must be greater than zero and have at most 2 decimal places",
        });
      }

      if (body.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: body.categoryId },
          select: { id: true, isActive: true },
        });

        if (!category || !category.isActive) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "The selected category does not exist or is inactive",
          });
        }
      }

      try {
        const product = await prisma.$transaction(async (tx) => {
          const created = await tx.product.create({
            data: {
              sku,
              name,
              description: body.description?.trim() || null,
              barcode,
              pluCode,
              sellingMode: body.sellingMode,
              unitOfMeasure: body.unitOfMeasure,
              price: body.price,
              categoryId: body.categoryId ?? null,
              trackInventory: body.trackInventory ?? true,
            },
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "PRODUCT_CREATED",
              entityType: "Product",
              entityId: created.id,
            },
          });

          return created;
        });

        return reply.code(201).send(product);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.code(409).send({
            error: "Conflict",
            message: "SKU, barcode, or PLU code is already in use",
          });
        }

        throw error;
      }
    },
  );

  // LIST AND SEARCH PRODUCTS
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const query = request.query as {
        search?: string;
        categoryId?: string;
        sellingMode?: "UNIT" | "WEIGHT";
        isActive?: string;
        page?: string;
        limit?: string;
      };

      const page = Math.max(1, Number.parseInt(query.page ?? "1", 10));
      const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(query.limit ?? "20", 10)),
      );

      if (!Number.isInteger(page) || !Number.isInteger(limit)) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Invalid pagination parameters",
        });
      }

      const search = query.search?.trim();

      const where = {
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { sku: { contains: search, mode: "insensitive" as const } },
                { barcode: { contains: search } },
                { pluCode: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.sellingMode ? { sellingMode: query.sellingMode } : {}),
        ...(query.isActive === "true"
          ? { isActive: true }
          : query.isActive === "false"
            ? { isActive: false }
            : {}),
      };

      const [products, total] = await prisma.$transaction([
        prisma.product.findMany({
          where,
          include: {
            category: {
              select: { id: true, name: true },
            },
          },
          orderBy: { name: "asc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        data: products,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // BARCODE LOOKUP
  app.get<{ Params: { barcode: string } }>(
    "/barcode/:barcode",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const product = await prisma.product.findUnique({
        where: { barcode: request.params.barcode },
        include: {
          category: { select: { id: true, name: true } },
        },
      });

      if (!product || !product.isActive) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Active product with this barcode was not found",
        });
      }

      return product;
    },
  );

  // PLU LOOKUP
  app.get<{ Params: { pluCode: string } }>(
    "/plu/:pluCode",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const product = await prisma.product.findUnique({
        where: { pluCode: request.params.pluCode },
        include: {
          category: { select: { id: true, name: true } },
        },
      });

      if (!product || !product.isActive) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Active product with this PLU code was not found",
        });
      }

      return product;
    },
  );

  // GET ONE PRODUCT
  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const product = await prisma.product.findUnique({
        where: { id: request.params.id },
        include: {
          category: true,
          inventory: true,
        },
      });

      if (!product) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Product not found",
        });
      }

      return product;
    },
  );

  // UPDATE PRODUCT
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: [authenticate, managerAccess],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: {
            sku: { type: "string", minLength: 1, maxLength: 50 },
            name: { type: "string", minLength: 1, maxLength: 150 },
            description: {
              type: ["string", "null"],
              maxLength: 1000,
            },
            barcode: { type: ["string", "null"], maxLength: 100 },
            pluCode: { type: ["string", "null"], maxLength: 30 },
            sellingMode: { type: "string", enum: ["UNIT", "WEIGHT"] },
            unitOfMeasure: {
              type: "string",
              enum: [
                "PIECE",
                "PACKET",
                "BOTTLE",
                "BOX",
                "KG",
                "GRAM",
                "LITRE",
              ],
            },
            price: {
              type: "string",
              pattern: pricePattern,
              maxLength: 15,
            },
            categoryId: { type: ["string", "null"] },
            trackInventory: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        sku?: string;
        name?: string;
        description?: string | null;
        barcode?: string | null;
        pluCode?: string | null;
        sellingMode?: "UNIT" | "WEIGHT";
        unitOfMeasure?:
          | "PIECE"
          | "PACKET"
          | "BOTTLE"
          | "BOX"
          | "KG"
          | "GRAM"
          | "LITRE";
        price?: string;
        categoryId?: string | null;
        trackInventory?: boolean;
      };

      const existing = await prisma.product.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Product not found",
        });
      }

      if (body.name !== undefined && !body.name.trim()) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Product name cannot be empty",
        });
      }

      if (body.sku !== undefined && !body.sku.trim()) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "SKU cannot be empty",
        });
      }

      if (body.price !== undefined && !isPositivePrice(body.price)) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Price must be greater than zero and have at most 2 decimal places",
        });
      }

      if (body.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: body.categoryId },
          select: { id: true, isActive: true },
        });

        if (!category || !category.isActive) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "The selected category does not exist or is inactive",
          });
        }
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          const result = await tx.product.update({
            where: { id: request.params.id },
            data: {
              ...(body.sku !== undefined
                ? { sku: body.sku.trim().toUpperCase() }
                : {}),
              ...(body.name !== undefined ? { name: body.name.trim() } : {}),
              ...(body.description !== undefined
                ? { description: body.description?.trim() || null }
                : {}),
              ...(body.barcode !== undefined
                ? { barcode: body.barcode?.trim() || null }
                : {}),
              ...(body.pluCode !== undefined
                ? { pluCode: body.pluCode?.trim() || null }
                : {}),
              ...(body.sellingMode !== undefined
                ? { sellingMode: body.sellingMode }
                : {}),
              ...(body.unitOfMeasure !== undefined
                ? { unitOfMeasure: body.unitOfMeasure }
                : {}),
              ...(body.price !== undefined ? { price: body.price } : {}),
              ...(body.categoryId !== undefined
                ? { categoryId: body.categoryId }
                : {}),
              ...(body.trackInventory !== undefined
                ? { trackInventory: body.trackInventory }
                : {}),
            },
            include: {
              category: { select: { id: true, name: true } },
            },
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "PRODUCT_UPDATED",
              entityType: "Product",
              entityId: result.id,
            },
          });

          if (
            body.price !== undefined &&
            existing.price.toString() !== body.price
          ) {
            await tx.auditLog.create({
              data: {
                userId: request.authUser!.id,
                action: "PRODUCT_PRICE_UPDATED",
                entityType: "Product",
                entityId: result.id,
              },
            });
          }

          return result;
        });

        return updated;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return reply.code(409).send({
            error: "Conflict",
            message: "SKU, barcode, or PLU code is already in use",
          });
        }

        throw error;
      }
    },
  );

  // ACTIVATE OR DEACTIVATE PRODUCT
  app.patch<{ Params: { id: string } }>(
    "/:id/status",
    {
      preHandler: [authenticate, managerAccess],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["isActive"],
          properties: {
            isActive: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { isActive: boolean };

      const existing = await prisma.product.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Product not found",
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.product.update({
          where: { id: request.params.id },
          data: { isActive: body.isActive },
        });

        await tx.auditLog.create({
          data: {
            userId: request.authUser!.id,
            action: body.isActive
              ? "PRODUCT_ACTIVATED"
              : "PRODUCT_DEACTIVATED",
            entityType: "Product",
            entityId: result.id,
          },
        });

        return result;
      });

      return updated;
    },
  );
}
