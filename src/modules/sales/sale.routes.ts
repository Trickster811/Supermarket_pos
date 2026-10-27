import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate } from "../../plugins/authenticate.js";
import { authenticateTerminal } from "../../plugins/terminal-auth.js";

type SaleItemInput = {
  productId: string;
  quantity: string;
};

type SaleInput = {
  transactionUuid: string;
  terminalId: string;
  deviceCreatedAt: string;
  items: SaleItemInput[];
};

class SaleOperationError extends Error {
  constructor(
    public readonly reason:
      | "NOT_FOUND"
      | "INVALID_PRODUCT"
      | "INSUFFICIENT_STOCK",
    message: string,
  ) {
    super(message);
    this.name = "SaleOperationError";
  }
}

const quantityPattern = /^(0|[1-9][0-9]{0,10})(\.[0-9]{1,3})?$/;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function quantityToMilliUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

function priceToCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function centsToAmount(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");

  return `${whole}.${fraction}`;
}

function calculateSubtotal(quantity: string, unitPrice: string): bigint {
  const quantityMilli = quantityToMilliUnits(quantity);
  const unitPriceCents = priceToCents(unitPrice);

  // Round to the nearest cent.
  return (quantityMilli * unitPriceCents + 500n) / 1000n;
}

function makeReceiptNumber(): string {
  return `POS-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

/**
 * Validate sale items without trusting the incoming request body.
 * Also prevents duplicate product IDs in a single sale.
 */
function validSaleItems(items: unknown): items is SaleItemInput[] {
  if (!Array.isArray(items) || items.length === 0) {
    return false;
  }

  const productIds = new Set<string>();

  for (const item of items) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return false;
    }

    const candidate = item as Record<string, unknown>;

    if (
      typeof candidate.productId !== "string" ||
      !uuidPattern.test(candidate.productId) ||
      typeof candidate.quantity !== "string" ||
      !quantityPattern.test(candidate.quantity) ||
      quantityToMilliUnits(candidate.quantity) <= 0n ||
      productIds.has(candidate.productId)
    ) {
      return false;
    }

    productIds.add(candidate.productId);
  }

  return true;
}

export async function saleRoutes(app: FastifyInstance) {
  // ============================================================
  // CREATE A SALE
  // ============================================================

  app.post(
    "/",
    {
      preHandler: [authenticate, authenticateTerminal],
    },
    async (request, reply) => {
      const body = request.body as SaleInput;

      // This terminal comes from successful terminal authentication.
      const authenticatedTerminal = request.authTerminal;

      if (!authenticatedTerminal) {
        return reply.code(401).send({
          message: "Terminal authentication required.",
        });
      }

      if (
        !body ||
        typeof body !== "object" ||
        typeof body.transactionUuid !== "string" ||
        !uuidPattern.test(body.transactionUuid) ||
        typeof body.terminalId !== "string" ||
        !uuidPattern.test(body.terminalId) ||
        typeof body.deviceCreatedAt !== "string" ||
        !Number.isFinite(Date.parse(body.deviceCreatedAt)) ||
        !validSaleItems(body.items)
      ) {
        return reply.code(400).send({
          message: "Invalid sale request.",
        });
      }

      // A device must not be able to submit a sale under another
      // terminal's identity by modifying terminalId in the body.
      if (body.terminalId !== authenticatedTerminal.id) {
        return reply.code(403).send({
          message:
            "The requested terminal does not match the authenticated terminal.",
        });
      }

      // The transaction UUID makes retries safe, particularly
      // when a phone reconnects and resubmits a pending sale.
      const existingSale = await prisma.sale.findUnique({
        where: {
          transactionUuid: body.transactionUuid,
        },
        include: {
          items: true,
          receipt: true,
        },
      });

      if (existingSale) {
        return reply.code(200).send({
          message: "This transaction has already been recorded.",
          sale: existingSale,
          duplicate: true,
        });
      }

      try {
        const sale = await prisma.$transaction(
          async (tx) => {
            // Verify the authenticated terminal still exists
            // and is active.
            const dbTerminal = await tx.terminal.findUnique({
              where: {
                id: authenticatedTerminal.id,
              },
              select: {
                id: true,
                isActive: true,
              },
            });

            if (!dbTerminal || !dbTerminal.isActive) {
              throw new SaleOperationError(
                "NOT_FOUND",
                "Checkout terminal not found or inactive.",
              );
            }

            // Retrieve active products and their authoritative prices.
            const products = await tx.product.findMany({
              where: {
                id: {
                  in: body.items.map((item) => item.productId),
                },
                isActive: true,
              },
              select: {
                id: true,
                name: true,
                sellingMode: true,
                unitOfMeasure: true,
                price: true,
                trackInventory: true,
              },
            });

            if (products.length !== body.items.length) {
              throw new SaleOperationError(
                "INVALID_PRODUCT",
                "One or more products do not exist or are inactive.",
              );
            }

            const productMap = new Map(
              products.map((product) => [product.id, product]),
            );

            let totalCents = 0n;

            // Prepare sale items using prices from the server.
            const preparedItems = body.items.map((item) => {
              const product = productMap.get(item.productId)!;

              // UNIT products must be sold in whole quantities.
              // WEIGHT products can use fractional quantities.
              if (
                product.sellingMode === "UNIT" &&
                quantityToMilliUnits(item.quantity) % 1000n !== 0n
              ) {
                throw new SaleOperationError(
                  "INVALID_PRODUCT",
                  `${product.name} must be sold in whole units.`,
                );
              }

              const unitPrice = product.price.toString();

              const subtotalCents = calculateSubtotal(item.quantity, unitPrice);

              totalCents += subtotalCents;

              return {
                product,
                quantity: item.quantity,
                unitPrice,
                subtotal: centsToAmount(subtotalCents),
              };
            });

            const createdSale = await tx.sale.create({
              data: {
                transactionUuid: body.transactionUuid,
                cashierId: request.authUser!.id,
                terminalId: dbTerminal.id,
                totalAmount: centsToAmount(totalCents),
                currencyCode: "XAF",
                deviceCreatedAt: new Date(body.deviceCreatedAt),
              },
            });

            const createdItems = [];

            for (const item of preparedItems) {
              const saleItem = await tx.saleItem.create({
                data: {
                  saleId: createdSale.id,
                  productId: item.product.id,
                  productName: item.product.name,
                  unitOfMeasure: item.product.unitOfMeasure,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  subtotal: item.subtotal,
                },
              });

              createdItems.push({
                ...item,
                saleItemId: saleItem.id,
              });

              // Only products configured for inventory tracking
              // have their stock decremented.
              if (item.product.trackInventory) {
                const stockUpdate = await tx.inventory.updateMany({
                  where: {
                    productId: item.product.id,
                    quantity: {
                      gte: item.quantity,
                    },
                  },
                  data: {
                    quantity: {
                      decrement: item.quantity,
                    },
                  },
                });

                if (stockUpdate.count !== 1) {
                  throw new SaleOperationError(
                    "INSUFFICIENT_STOCK",
                    `Insufficient stock for ${item.product.name}.`,
                  );
                }

                // Record the corresponding inventory movement.
                await tx.inventoryMovement.create({
                  data: {
                    productId: item.product.id,
                    movementType: "SALE",
                    quantityChange: `-${item.quantity}`,
                    saleItemId: saleItem.id,
                    performedById: request.authUser!.id,
                    terminalId: dbTerminal.id,
                    reason: `Sale ${createdSale.id}`,
                  },
                });
              }
            }

            const receiptNumber = makeReceiptNumber();

            const receiptContent = {
              receiptNumber,
              saleId: createdSale.id,
              transactionUuid: body.transactionUuid,
              cashierId: request.authUser!.id,
              terminalId: dbTerminal.id,
              currencyCode: "XAF",
              issuedAt: new Date().toISOString(),

              items: createdItems.map((item) => ({
                productId: item.product.id,
                productName: item.product.name,
                unitOfMeasure: item.product.unitOfMeasure,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
              })),

              totalAmount: centsToAmount(totalCents),
            };

            const receipt = await tx.receipt.create({
              data: {
                receiptNumber,
                saleId: createdSale.id,
                content: receiptContent,
              },
            });

            await tx.auditLog.create({
              data: {
                userId: request.authUser!.id,
                terminalId: dbTerminal.id,
                action: "SALE_COMPLETED",
                entityType: "Sale",
                entityId: createdSale.id,
                details: {
                  receiptNumber,
                  transactionUuid: body.transactionUuid,
                  totalAmount: centsToAmount(totalCents),
                  itemCount: createdItems.length,
                },
              },
            });

            return {
              ...createdSale,
              items: createdItems,
              receipt,
            };
          },
          {
            isolationLevel: "Serializable",
          },
        );

        return reply.code(201).send({
          message: "Sale completed successfully.",
          sale,
          duplicate: false,
        });
      } catch (error) {
        
        if (error instanceof SaleOperationError) {
          if (error.reason === "NOT_FOUND") {
            return reply.code(404).send({
              message: error.message,
            });
          }

          if (error.reason === "INVALID_PRODUCT") {
            return reply.code(400).send({
              message: error.message,
            });
          }

          if (error.reason === "INSUFFICIENT_STOCK") {
            return reply.code(409).send({
              message: error.message,
            });
          }
        }

        // Another request may have inserted the same transaction
        // while this request was executing.
        if (isPrismaError(error, "P2002")) {
          const duplicate = await prisma.sale.findUnique({
            where: {
              transactionUuid: body.transactionUuid,
            },
            include: {
              items: true,
              receipt: true,
            },
          });

          if (duplicate) {
            return reply.code(200).send({
              message: "This transaction has already been recorded.",
              sale: duplicate,
              duplicate: true,
            });
          }
        }

        request.log.error(error);

        if (isPrismaError(error, "P2034")) {
          return reply.code(409).send({
            message: "A concurrent stock operation occurred. Please retry.",
          });
        }

        return reply.code(500).send({
          message:
            "Could not complete sale. No partial transaction was committed.",
        });
      }
    },
  );

  // ============================================================
  // LIST SALES
  // ============================================================

  app.get(
    "/",
    {
      preHandler: [authenticate],
    },
    async (request) => {
      const query = request.query as {
        page?: number;
        limit?: number;
        terminalId?: string;
        cashierId?: string;
      };

      const user = request.authUser!;

      const page = Math.max(1, Number(query.page) || 1);

      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

      // Cashiers can only see their own sales.
      // Admins and managers can filter by any cashier.
      const where = {
        ...(user.role === "CASHIER"
          ? {
              cashierId: user.id,
            }
          : query.cashierId
            ? {
                cashierId: query.cashierId,
              }
            : {}),

        ...(query.terminalId
          ? {
              terminalId: query.terminalId,
            }
          : {}),
      };

      const [sales, total] = await prisma.$transaction([
        prisma.sale.findMany({
          where,
          include: {
            cashier: {
              select: {
                id: true,
                fullName: true,
                username: true,
              },
            },
            terminal: {
              select: {
                id: true,
                terminalCode: true,
                name: true,
              },
            },
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                issuedAt: true,
              },
            },
            _count: {
              select: {
                items: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: (page - 1) * limit,
          take: limit,
        }),

        prisma.sale.count({
          where,
        }),
      ]);

      return {
        data: sales,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // ============================================================
  // GET SALE DETAILS
  // ============================================================

  app.get(
    "/:id",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const { id } = request.params as {
        id: string;
      };

      const user = request.authUser!;

      const sale = await prisma.sale.findFirst({
        where: {
          id,

          // Cashiers can only access their own sales.
          ...(user.role === "CASHIER"
            ? {
                cashierId: user.id,
              }
            : {}),
        },

        include: {
          cashier: {
            select: {
              id: true,
              fullName: true,
              username: true,
            },
          },
          terminal: {
            select: {
              id: true,
              terminalCode: true,
              name: true,
            },
          },
          items: true,
          receipt: true,
        },
      });

      if (!sale) {
        return reply.code(404).send({
          message: "Sale not found.",
        });
      }

      return sale;
    },
  );
}
