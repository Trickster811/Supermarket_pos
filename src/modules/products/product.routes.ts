import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";
import { Prisma } from "../../../generated/prisma/client.js";

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

function toSkuSegment(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return normalized.slice(0, 3) || "GEN";
}

function getPluStartValue(): bigint {
  const configuredStart = process.env.PLU_START ?? "20001";

  if (!/^[1-9]\d*$/.test(configuredStart)) {
    throw new Error(
      "PLU_START must be a positive integer without leading zeros",
    );
  }

  return BigInt(configuredStart);
}

async function acquirePluAllocationLock(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$queryRaw<Array<{ locked: number }>>`
    WITH lock_acquired AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(82026001::bigint)
    )
    SELECT 1 AS locked
    FROM lock_acquired
  `;
}

async function getNextPluCode(tx: Prisma.TransactionClient): Promise<string> {
  const startValue = getPluStartValue();

  const rows = await tx.$queryRaw<Array<{ maxPlu: string | null }>>`
    SELECT MAX("pluCode"::numeric)::text AS "maxPlu"
    FROM "products"
    WHERE "pluCode" ~ '^[0-9]+$'
  `;

  const highestExisting = rows[0]?.maxPlu
    ? BigInt(rows[0].maxPlu)
    : startValue - 1n;

  const nextValue =
    highestExisting >= startValue ? highestExisting + 1n : startValue;

  const nextCode = nextValue.toString();

  if (nextCode.length > 30) {
    throw new Error("PLU sequence exceeded the maximum supported length");
  }

  return nextCode;
}

async function generateNextPluCode(
  tx: Prisma.TransactionClient,
): Promise<string> {
  await acquirePluAllocationLock(tx);
  return getNextPluCode(tx);
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
          required: ["sku", "name", "sellingMode", "unitOfMeasure", "price"],
          properties: {
            sku: { type: "string", minLength: 1, maxLength: 50 },
            name: { type: "string", minLength: 1, maxLength: 150 },
            description: { type: "string", maxLength: 1000 },
            barcode: { type: ["string", "null"], maxLength: 100 },
            pluCode: { type: ["string", "null"], maxLength: 30 },
            sellingMode: { type: "string", enum: ["UNIT", "WEIGHT"] },
            unitOfMeasure: {
              type: "string",
              enum: ["PIECE", "PACKET", "BOTTLE", "BOX", "KG", "GRAM", "LITRE"],
            },
            price: {
              type: "string",
              pattern: pricePattern,
              maxLength: 15,
            },
            taxRate: {
              type: "string",
              pattern: "^(100(\\.0{1,2})?|([0-9]{1,2})(\\.[0-9]{1,2})?)$",
              maxLength: 6,
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
        taxRate?: string;
        categoryId?: string | null;
        trackInventory?: boolean;
      };

      const sku = body.sku.trim().toUpperCase();
      const name = body.name.trim();
      const barcode = body.barcode?.trim() || null;
      // const pluCode = body.pluCode?.trim() || null;

      if (!sku || !name) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "SKU and product name cannot be empty",
        });
      }

      if (!isPositivePrice(body.price)) {
        return reply.code(400).send({
          error: "ValidationError",
          message:
            "Price must be greater than zero and have at most 2 decimal places",
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
          const pluCode =
            body.sellingMode === "WEIGHT"
              ? await generateNextPluCode(tx)
              : null;
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
              taxRate: body.taxRate ?? "0",
              categoryId: body.categoryId ?? null,
              trackInventory: body.trackInventory ?? true,
            },
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          });

          // Automatically initialize inventory for tracked products.
          if (created.trackInventory) {
            await tx.inventory.create({
              data: {
                productId: created.id,
                quantity: "0",
              },
            });
          }

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
  app.get("/", { preHandler: [authenticate] }, async (request, reply) => {
    const query = request.query as {
      search?: string;
      categoryId?: string;
      sellingMode?: "UNIT" | "WEIGHT";
      isActive?: string;
      page?: string;
      limit?: string;
      isArchived?: string;
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
      ...(query.isArchived === "all"
        ? {}
        : { isArchived: query.isArchived === "true" }),
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
  });

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

      if (!product || !product.isActive || product.isArchived) {
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

      if (!product || !product.isActive || product.isArchived) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Active product with this PLU code was not found",
        });
      }

      return product;
    },
  );

  // GENERATE SKU SUGGESTION
  app.get<{
    Querystring: {
      name: string;
      categoryId?: string;
    };
  }>(
    "/sku-suggestion",
    {
      preHandler: [authenticate, managerAccess],
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 150 },
            categoryId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const name = request.query.name.trim();

      if (!name) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Product name cannot be empty",
        });
      }

      let categoryCode = "GEN";

      if (request.query.categoryId) {
        const category = await prisma.category.findUnique({
          where: { id: request.query.categoryId },
          select: { id: true, name: true, isActive: true },
        });

        if (!category || !category.isActive) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "The selected category does not exist or is inactive",
          });
        }

        categoryCode = toSkuSegment(category.name);
      }

      const productWords = name.split(/\s+/);
      const firstProductWord =
        productWords.find((word) => /[a-zA-Z0-9]/.test(word)) ?? name;

      const productCode = toSkuSegment(firstProductWord);
      const prefix = `${categoryCode}-${productCode}`;

      // Read existing SKUs with this prefix to find the next unused number.
      const existingProducts = await prisma.product.findMany({
        where: {
          sku: {
            startsWith: `${prefix}-`,
          },
        },
        select: {
          sku: true,
        },
      });

      const usedNumbers = new Set<number>();

      for (const product of existingProducts) {
        const match = product.sku.match(new RegExp(`^${prefix}-([0-9]+)$`));

        if (match) {
          usedNumbers.add(Number(match[1]));
        }
      }

      let nextNumber = 1;

      while (usedNumbers.has(nextNumber)) {
        nextNumber++;
      }

      const sku = `${prefix}-${String(nextNumber).padStart(4, "0")}`;

      return reply.send({ sku });
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
              enum: ["PIECE", "PACKET", "BOTTLE", "BOX", "KG", "GRAM", "LITRE"],
            },
            price: {
              type: "string",
              pattern: pricePattern,
              maxLength: 15,
            },
            taxRate: {
              type: "string",
              pattern: "^(100(\\.0{1,2})?|([0-9]{1,2})(\\.[0-9]{1,2})?)$",
              maxLength: 6,
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
        taxRate?: string;
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
          message:
            "Price must be greater than zero and have at most 2 decimal places",
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
          const current = await tx.product.findUnique({
            where: { id: request.params.id },
          });

          if (!current) {
            return null;
          }

          let assignedPluCode = current.pluCode;

          const targetSellingMode = body.sellingMode ?? current.sellingMode;

          if (targetSellingMode === "WEIGHT" && !assignedPluCode) {
            // Serialize allocation and re-read the product after acquiring the lock.
            await acquirePluAllocationLock(tx);

            const latest = await tx.product.findUnique({
              where: { id: request.params.id },
            });

            if (!latest) {
              return null;
            }

            const latestSellingMode = body.sellingMode ?? latest.sellingMode;

            assignedPluCode = latest.pluCode;

            if (latestSellingMode === "WEIGHT" && !assignedPluCode) {
              assignedPluCode = await getNextPluCode(tx);
            }
          }

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
              pluCode: assignedPluCode,
              ...(body.sellingMode !== undefined
                ? { sellingMode: body.sellingMode }
                : {}),
              ...(body.unitOfMeasure !== undefined
                ? { unitOfMeasure: body.unitOfMeasure }
                : {}),
              ...(body.price !== undefined ? { price: body.price } : {}),
              ...(body.taxRate !== undefined ? { taxRate: body.taxRate } : {}),
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

          if (result.trackInventory) {
            await tx.inventory.upsert({
              where: {
                productId: result.id,
              },
              create: {
                productId: result.id,
                quantity: "0",
              },
              update: {},
            });
          }

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

        if (!updated) {
          return reply.code(404).send({
            error: "NotFound",
            message: "Product not found",
          });
        }

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
            action: body.isActive ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED",
            entityType: "Product",
            entityId: result.id,
          },
        });

        return result;
      });

      return updated;
    },
  );

  // ARCHIVE PRODUCT
  app.patch<{ Params: { id: string } }>(
    "/:id/archive",
    {
      preHandler: [authenticate, managerAccess],
    },
    async (request, reply) => {
      const existing = await prisma.product.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Product not found",
        });
      }

      if (existing.isArchived) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Product is already archived",
        });
      }

      const archived = await prisma.$transaction(async (tx) => {
        const result = await tx.product.update({
          where: { id: request.params.id },
          data: {
            isArchived: true,
            archivedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            userId: request.authUser!.id,
            action: "PRODUCT_ARCHIVED",
            entityType: "Product",
            entityId: result.id,
            details: {
              productName: result.name,
              sku: result.sku,
            },
          },
        });

        return result;
      });

      return archived;
    },
  );

  // RESTORE ARCHIVED PRODUCT
  app.patch<{ Params: { id: string } }>(
    "/:id/restore",
    {
      preHandler: [authenticate, managerAccess],
    },
    async (request, reply) => {
      const existing = await prisma.product.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Product not found",
        });
      }

      if (!existing.isArchived) {
        return reply.code(409).send({
          error: "Conflict",
          message: "Product is not archived",
        });
      }

      const restored = await prisma.$transaction(async (tx) => {
        const result = await tx.product.update({
          where: { id: request.params.id },
          data: {
            isArchived: false,
            archivedAt: null,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: request.authUser!.id,
            action: "PRODUCT_RESTORED",
            entityType: "Product",
            entityId: result.id,
            details: {
              productName: result.name,
              sku: result.sku,
            },
          },
        });

        return result;
      });

      return restored;
    },
  );
}
