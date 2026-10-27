
import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";

const managerAccess = requireRoles("ADMIN", "MANAGER");

// Quantities are accepted as strings with up to 3 decimal places.
const quantityPattern = "^-?(0|[1-9][0-9]{0,10})(\\.[0-9]{1,3})?$";

type AdjustmentType = "OPENING_STOCK" | "ADJUSTMENT" | "SPOILAGE";

function quantityToMilliUnits(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const milliUnits = BigInt(whole) * 1000n +
    BigInt(fraction.padEnd(3, "0"));

  return negative ? -milliUnits : milliUnits;
}

function isValidQuantity(value: string): boolean {
  return new RegExp(quantityPattern).test(value);
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export async function inventoryRoutes(app: FastifyInstance) {
  // LIST INVENTORY
  app.get(
    "/",
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            search: { type: "string" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request) => {
      const query = request.query as {
        search?: string;
        page?: number;
        limit?: number;
      };

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const search = query.search?.trim();

      const where = {
        ...(search
          ? {
              product: {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { sku: { contains: search, mode: "insensitive" as const } },
                  { barcode: { contains: search } },
                  { pluCode: { contains: search, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      };

      const [inventory, total] = await prisma.$transaction([
        prisma.inventory.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                barcode: true,
                pluCode: true,
                sellingMode: true,
                unitOfMeasure: true,
                isActive: true,
                trackInventory: true,
              },
            },
          },
          orderBy: { product: { name: "asc" } },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.inventory.count({ where }),
      ]);

      return {
        data: inventory,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // LOW-STOCK REPORT
  // The threshold is supplied by the caller because the current schema
  // does not store a separate minimum-stock level for each product.
  app.get(
    "/low-stock",
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["threshold"],
          properties: {
            threshold: {
              type: "string",
              pattern: "^(0|[1-9][0-9]{0,10})(\\.[0-9]{1,3})?$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { threshold } = request.query as { threshold: string };

      if (quantityToMilliUnits(threshold) < 0n) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Threshold cannot be negative",
        });
      }

      const items = await prisma.inventory.findMany({
        where: {
          quantity: { lte: threshold },
          product: {
            isActive: true,
            trackInventory: true,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              unitOfMeasure: true,
              price: true,
            },
          },
        },
        orderBy: { quantity: "asc" },
      });

      return {
        threshold,
        data: items,
        count: items.length,
      };
    },
  );

  // GET STOCK FOR ONE PRODUCT
  app.get<{ Params: { productId: string } }>(
    "/:productId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const product = await prisma.product.findUnique({
        where: { id: request.params.productId },
        select: {
          id: true,
          sku: true,
          name: true,
          unitOfMeasure: true,
          sellingMode: true,
          trackInventory: true,
        },
      });

      if (!product) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Product not found",
        });
      }

      if (!product.trackInventory) {
        return {
          product,
          inventoryTracked: false,
          quantity: null,
        };
      }

      const inventory = await prisma.inventory.findUnique({
        where: { productId: product.id },
      });

      return {
        product,
        inventoryTracked: true,
        quantity: inventory?.quantity.toString() ?? "0.000",
        updatedAt: inventory?.updatedAt ?? null,
      };
    },
  );

  // GET MOVEMENT HISTORY FOR ONE PRODUCT
  app.get<{ Params: { productId: string } }>(
    "/:productId/movements",
    {
      preHandler: [authenticate],
      schema: {
        querystring: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const { productId } = request.params;
      const query = request.query as {
        page?: number;
        limit?: number;
      };

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true, name: true, unitOfMeasure: true },
      });

      if (!product) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Product not found",
        });
      }

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const [movements, total] = await prisma.$transaction([
        prisma.inventoryMovement.findMany({
          where: { productId },
          include: {
            performedBy: {
              select: { id: true, fullName: true, username: true },
            },
            terminal: {
              select: { id: true, terminalCode: true, name: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.inventoryMovement.count({ where: { productId } }),
      ]);

      return {
        product,
        data: movements,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // RECORD OPENING STOCK, ADJUSTMENT, OR SPOILAGE
  app.post(
    "/adjustments",
    {
      preHandler: [authenticate, managerAccess],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["productId", "movementType", "quantityChange", "reason"],
          properties: {
            productId: { type: "string" },
            movementType: {
              type: "string",
              enum: ["OPENING_STOCK", "ADJUSTMENT", "SPOILAGE"],
            },
            quantityChange: {
              type: "string",
              pattern: quantityPattern,
              maxLength: 16,
            },
            reason: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        productId: string;
        movementType: AdjustmentType;
        quantityChange: string;
        reason: string;
      };

      const quantity = quantityToMilliUnits(body.quantityChange);
      const reason = body.reason.trim();

      if (quantity === 0n) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Quantity change cannot be zero",
        });
      }

      if (!reason) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "A reason is required",
        });
      }

      if (body.movementType === "OPENING_STOCK" && quantity <= 0n) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Opening stock must be a positive quantity",
        });
      }

      if (body.movementType === "SPOILAGE" && quantity >= 0n) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Spoilage must be a negative quantity",
        });
      }

      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const product = await tx.product.findUnique({
              where: { id: body.productId },
              select: {
                id: true,
                sku: true,
                name: true,
                unitOfMeasure: true,
                trackInventory: true,
              },
            });

            if (!product) {
              return { error: "PRODUCT_NOT_FOUND" as const };
            }

            if (!product.trackInventory) {
              return { error: "INVENTORY_NOT_TRACKED" as const };
            }

            if (body.movementType === "OPENING_STOCK") {
              const previousMovement =
                await tx.inventoryMovement.findFirst({
                  where: { productId: product.id },
                  select: { id: true },
                });

              if (previousMovement) {
                return { error: "OPENING_STOCK_ALREADY_RECORDED" as const };
              }
            }

            // Ensure an inventory row exists.
            // skipDuplicates makes simultaneous first-time requests safer.
            await tx.inventory.createMany({
              data: [{ productId: product.id, quantity: "0" }],
              skipDuplicates: true,
            });

            const amount = body.quantityChange.replace(/^-/, "");

            // Update the balance atomically. A negative movement only
            // succeeds if sufficient stock is available.
            const updatedCount = await tx.inventory.updateMany({
              where: {
                productId: product.id,
                ...(quantity < 0n ? { quantity: { gte: amount } } : {}),
              },
              data: {
                quantity:
                  quantity > 0n
                    ? { increment: amount }
                    : { decrement: amount },
              },
            });

            if (updatedCount.count !== 1) {
              return { error: "INSUFFICIENT_STOCK" as const };
            }

            const movement = await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                movementType: body.movementType,
                quantityChange: body.quantityChange,
                performedById: request.authUser!.id,
                reason,
              },
            });

            const inventory = await tx.inventory.findUniqueOrThrow({
              where: { productId: product.id },
            });

            await tx.auditLog.create({
              data: {
                userId: request.authUser!.id,
                action: "INVENTORY_ADJUSTED",
                entityType: "Inventory",
                entityId: inventory.id,
                details: {
                  productId: product.id,
                  movementType: body.movementType,
                  quantityChange: body.quantityChange,
                  reason,
                },
              },
            });

            return {
              inventory,
              movement,
              product,
            };
          },
          { isolationLevel: "Serializable" },
        );

        if ("error" in result) {
          if (result.error === "PRODUCT_NOT_FOUND") {
            return reply.code(404).send({
              error: "NotFound",
              message: "Product not found",
            });
          }

          if (result.error === "INVENTORY_NOT_TRACKED") {
            return reply.code(400).send({
              error: "ValidationError",
              message: "Inventory tracking is disabled for this product",
            });
          }

          if (result.error === "OPENING_STOCK_ALREADY_RECORDED") {
            return reply.code(409).send({
              error: "Conflict",
              message: "Opening stock has already been recorded for this product",
            });
          }

          return reply.code(409).send({
            error: "InsufficientStock",
            message: "The stock quantity cannot become negative",
          });
        }

        return reply.code(201).send({
          message: "Inventory updated successfully",
          product: result.product,
          inventory: result.inventory,
          movement: result.movement,
        });
      } catch (error) {
        if (isPrismaError(error, "P2034")) {
          return reply.code(409).send({
            error: "TransactionConflict",
            message: "Another stock operation occurred simultaneously. Please retry.",
          });
        }

        throw error;
      }
    },
  );
}
