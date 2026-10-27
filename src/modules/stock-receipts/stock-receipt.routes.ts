
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";

const managerAccess = requireRoles("ADMIN", "MANAGER");

const quantityPattern = /^(0|[1-9][0-9]{0,10})(\.[0-9]{1,3})?$/;
const costPattern = /^(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?$/;

type ReceiptItemInput = {
  productId: string;
  quantity: string;
  unitCost: string;
};

type ReceiptInput = {
  supplierName: string;
  supplierReference?: string | null;
  notes?: string | null;
  items: ReceiptItemInput[];
};

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function quantityToMilliUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

function formatQuantity(value: bigint): string {
  const whole = value / 1000n;
  const fraction = (value % 1000n).toString().padStart(3, "0");
  return `${whole}.${fraction}`;
}

// Calculates quantity × unit cost exactly, rounding to 2 decimal places.
function calculateTotalCost(quantity: string, unitCost: string): string {
  const quantityMilli = quantityToMilliUnits(quantity);
  const costCents = (() => {
    const [whole, fraction = ""] = unitCost.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  })();

  const numerator = quantityMilli * costCents;
  const roundedCents = (numerator + 500n) / 1000n;

  const whole = roundedCents / 100n;
  const fraction = (roundedCents % 100n).toString().padStart(2, "0");

  return `${whole}.${fraction}`;
}

function validItems(items: ReceiptItemInput[]): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;

  const productIds = new Set<string>();

  for (const item of items) {
    if (
      typeof item.productId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.productId) ||
      typeof item.quantity !== "string" ||
      !quantityPattern.test(item.quantity) ||
      quantityToMilliUnits(item.quantity) <= 0n ||
      typeof item.unitCost !== "string" ||
      !costPattern.test(item.unitCost)
    ) {
      return false;
    }

    // One line per product keeps receipt editing and movement linking simple.
    if (productIds.has(item.productId)) return false;
    productIds.add(item.productId);
  }

  return true;
}

async function loadProducts(items: ReceiptItemInput[]) {
  const products = await prisma.product.findMany({
    where: {
      id: { in: items.map((item) => item.productId) },
      isActive: true,
      trackInventory: true,
    },
    select: {
      id: true,
      name: true,
      unitOfMeasure: true,
    },
  });

  if (products.length !== items.length) {
    return null;
  }

  return products;
}

function makeReceiptNumber(): string {
  return `SR-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function stockReceiptRoutes(app: FastifyInstance) {
  // CREATE A DRAFT RECEIPT
  app.post(
    "/",
    {
      preHandler: [authenticate, managerAccess],
    },
    async (request, reply) => {
      const body = request.body as ReceiptInput;

      if (
        typeof body?.supplierName !== "string" ||
        body.supplierName.trim().length === 0 ||
        body.supplierName.trim().length > 200
      ) {
        return reply.code(400).send({
          message: "A supplier name between 1 and 200 characters is required.",
        });
      }

      if (!validItems(body.items)) {
        return reply.code(400).send({
          message: "Provide valid receipt items. Each product must appear only once.",
        });
      }

      const products = await loadProducts(body.items);

      if (!products) {
        return reply.code(400).send({
          message: "One or more products do not exist, are inactive, or do not track inventory.",
        });
      }

      const productMap = new Map(products.map((product) => [product.id, product]));

      try {
        const receipt = await prisma.$transaction(async (tx) => {
          const created = await tx.stockReceipt.create({
            data: {
              receiptNumber: makeReceiptNumber(),
              supplierName: body.supplierName.trim(),
              supplierReference: body.supplierReference?.trim() || null,
              notes: body.notes?.trim() || null,
            },
          });

          await tx.stockReceiptItem.createMany({
            data: body.items.map((item) => {
              const product = productMap.get(item.productId)!;

              return {
                stockReceiptId: created.id,
                productId: product.id,
                productName: product.name,
                unitOfMeasure: product.unitOfMeasure,
                quantity: item.quantity,
                unitCost: item.unitCost,
                totalCost: calculateTotalCost(item.quantity, item.unitCost),
              };
            }),
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "STOCK_RECEIPT_CREATED",
              entityType: "StockReceipt",
              entityId: created.id,
              details: {
                receiptNumber: created.receiptNumber,
                supplierName: created.supplierName,
                itemCount: body.items.length,
              },
            },
          });

          return tx.stockReceipt.findUniqueOrThrow({
            where: { id: created.id },
            include: { items: true },
          });
        });

        return reply.code(201).send(receipt);
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: "Could not create stock receipt." });
      }
    },
  );

  // LIST / SEARCH RECEIPTS
  app.get(
    "/",
    {
      preHandler: [authenticate],
    },
    async (request) => {
      const query = request.query as {
        search?: string;
        status?: "DRAFT" | "RECEIVED" | "CANCELLED";
        page?: number;
        limit?: number;
      };

      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const search = query.search?.trim();

      const where = {
        ...(query.status ? { status: query.status } : {}),
        ...(search
          ? {
              OR: [
                { receiptNumber: { contains: search, mode: "insensitive" as const } },
                { supplierName: { contains: search, mode: "insensitive" as const } },
                { supplierReference: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [receipts, total] = await prisma.$transaction([
        prisma.stockReceipt.findMany({
          where,
          include: {
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.stockReceipt.count({ where }),
      ]);

      return {
        data: receipts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // GET ONE RECEIPT
  app.get(
    "/:id",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const receipt = await prisma.stockReceipt.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              inventoryMovement: true,
            },
            orderBy: { createdAt: "asc" },
          },
          receivedBy: {
            select: { id: true, fullName: true, username: true },
          },
        },
      });

      if (!receipt) {
        return reply.code(404).send({ message: "Stock receipt not found." });
      }

      return receipt;
    },
  );

  // UPDATE A DRAFT RECEIPT
  app.patch(
    "/:id",
    {
      preHandler: [authenticate, managerAccess],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<ReceiptInput>;

      if (
        body.supplierName !== undefined &&
        (typeof body.supplierName !== "string" ||
          body.supplierName.trim().length === 0 ||
          body.supplierName.trim().length > 200)
      ) {
        return reply.code(400).send({ message: "Invalid supplier name." });
      }

      if (body.items !== undefined && !validItems(body.items)) {
        return reply.code(400).send({
          message: "Provide valid receipt items. Each product must appear only once.",
        });
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          const existing = await tx.stockReceipt.findUnique({
            where: { id },
            include: { items: true },
          });

          if (!existing) {
            return { error: "NOT_FOUND" as const };
          }

          if (existing.status !== "DRAFT") {
            return { error: "NOT_DRAFT" as const };
          }

          let products: Awaited<ReturnType<typeof loadProducts>> = null;

          if (body.items !== undefined) {
            products = await tx.product.findMany({
              where: {
                id: { in: body.items.map((item) => item.productId) },
                isActive: true,
                trackInventory: true,
              },
              select: { id: true, name: true, unitOfMeasure: true },
            });

            if (products.length !== body.items.length) {
              return { error: "INVALID_PRODUCTS" as const };
            }
          }

          await tx.stockReceipt.update({
            where: { id },
            data: {
              ...(body.supplierName !== undefined
                ? { supplierName: body.supplierName.trim() }
                : {}),
              ...(body.supplierReference !== undefined
                ? { supplierReference: body.supplierReference?.trim() || null }
                : {}),
              ...(body.notes !== undefined
                ? { notes: body.notes?.trim() || null }
                : {}),
            },
          });

          if (body.items !== undefined && products) {
            await tx.stockReceiptItem.deleteMany({
              where: { stockReceiptId: id },
            });

            const productMap = new Map(products.map((product) => [product.id, product]));

            await tx.stockReceiptItem.createMany({
              data: body.items.map((item) => {
                const product = productMap.get(item.productId)!;

                return {
                  stockReceiptId: id,
                  productId: product.id,
                  productName: product.name,
                  unitOfMeasure: product.unitOfMeasure,
                  quantity: item.quantity,
                  unitCost: item.unitCost,
                  totalCost: calculateTotalCost(item.quantity, item.unitCost),
                };
              }),
            });
          }

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "STOCK_RECEIPT_UPDATED",
              entityType: "StockReceipt",
              entityId: id,
              details: {
                itemsReplaced: body.items !== undefined,
              },
            },
          });

          return {
            receipt: await tx.stockReceipt.findUniqueOrThrow({
              where: { id },
              include: { items: true },
            }),
          };
        });

        if ("error" in updated) {
          if (updated.error === "NOT_FOUND") {
            return reply.code(404).send({ message: "Stock receipt not found." });
          }
          if (updated.error === "NOT_DRAFT") {
            return reply.code(409).send({ message: "Only draft receipts can be edited." });
          }
          return reply.code(400).send({ message: "One or more products are invalid." });
        }

        return updated.receipt;
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: "Could not update stock receipt." });
      }
    },
  );

  // CONFIRM RECEIPT: UPDATE STOCK AND CREATE MOVEMENTS ATOMICALLY
  app.post(
    "/:id/confirm",
    {
      preHandler: [authenticate, managerAccess],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const receipt = await tx.stockReceipt.findUnique({
              where: { id },
              include: { items: true },
            });

            if (!receipt) return { error: "NOT_FOUND" as const };
            if (receipt.status !== "DRAFT") return { error: "NOT_DRAFT" as const };
            if (receipt.items.length === 0) return { error: "EMPTY" as const };

            // Create missing inventory rows before applying stock increments.
            await tx.inventory.createMany({
              data: receipt.items.map((item) => ({
                productId: item.productId,
                quantity: "0",
              })),
              skipDuplicates: true,
            });

            for (const item of receipt.items) {
              const updated = await tx.inventory.updateMany({
                where: { productId: item.productId },
                data: { quantity: { increment: item.quantity } },
              });

              if (updated.count !== 1) {
                throw new Error(`Could not update inventory for product ${item.productId}`);
              }

              await tx.inventoryMovement.create({
                data: {
                  productId: item.productId,
                  movementType: "STOCK_IN",
                  quantityChange: item.quantity,
                  performedById: request.authUser!.id,
                  stockReceiptItemId: item.id,
                  reason: `Received through stock receipt ${receipt.receiptNumber}`,
                },
              });
            }

            const statusUpdate = await tx.stockReceipt.updateMany({
              where: { id, status: "DRAFT" },
              data: {
                status: "RECEIVED",
                receivedAt: new Date(),
                receivedById: request.authUser!.id,
              },
            });

            if (statusUpdate.count !== 1) {
              throw new Error("Receipt status changed during confirmation.");
            }

            await tx.auditLog.create({
              data: {
                userId: request.authUser!.id,
                action: "STOCK_RECEIPT_CONFIRMED",
                entityType: "StockReceipt",
                entityId: id,
                details: {
                  receiptNumber: receipt.receiptNumber,
                  itemCount: receipt.items.length,
                },
              },
            });

            return {
              receipt: await tx.stockReceipt.findUniqueOrThrow({
                where: { id },
                include: { items: true },
              }),
            };
          },
          { isolationLevel: "Serializable" },
        );

        if ("error" in result) {
          if (result.error === "NOT_FOUND") {
            return reply.code(404).send({ message: "Stock receipt not found." });
          }
          if (result.error === "NOT_DRAFT") {
            return reply.code(409).send({
              message: "This receipt has already been confirmed or cancelled.",
            });
          }
          return reply.code(400).send({ message: "Cannot confirm an empty receipt." });
        }

        return result.receipt;
      } catch (error) {
        request.log.error(error);

        if (isPrismaError(error, "P2034")) {
          return reply.code(409).send({
            message: "A concurrent stock operation occurred. Please retry confirmation.",
          });
        }

        return reply.code(500).send({
          message: "Could not confirm stock receipt. No partial stock update was committed.",
        });
      }
    },
  );

  // CANCEL A DRAFT RECEIPT
  app.post(
    "/:id/cancel",
    {
      preHandler: [authenticate, managerAccess],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await prisma.$transaction(async (tx) => {
          const receipt = await tx.stockReceipt.findUnique({
            where: { id },
          });

          if (!receipt) return { error: "NOT_FOUND" as const };
          if (receipt.status !== "DRAFT") return { error: "NOT_DRAFT" as const };

          await tx.stockReceipt.update({
            where: { id },
            data: { status: "CANCELLED" },
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "STOCK_RECEIPT_CANCELLED",
              entityType: "StockReceipt",
              entityId: id,
              details: { receiptNumber: receipt.receiptNumber },
            },
          });

          return { success: true };
        });

        if ("error" in result) {
          if (result.error === "NOT_FOUND") {
            return reply.code(404).send({ message: "Stock receipt not found." });
          }
          return reply.code(409).send({
            message: "Only draft receipts can be cancelled.",
          });
        }

        return { message: "Stock receipt cancelled successfully." };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ message: "Could not cancel stock receipt." });
      }
    },
  );
}
