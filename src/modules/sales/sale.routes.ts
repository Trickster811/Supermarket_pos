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
  paymentMethod: "CASH" | "MOBILE_MONEY";
  amountReceived?: string;
  mobileMoneyProvider?: "MTN_MOMO" | "ORANGE_MONEY";
  paymentReference?: string;
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

function decimalRateToBasisPoints(rate: string | number): bigint {
  const value = String(rate);

  const [whole = "0", fraction = ""] = value.split(".");
  const basisPoints = `${fraction}00`.slice(0, 2);

  return BigInt(whole) * 100n + BigInt(basisPoints);
}

function calculateInclusiveVat(
  grossCents: bigint,
  rateBasisPoints: bigint,
): { netCents: bigint; taxCents: bigint } {
  if (rateBasisPoints === 0n) {
    return {
      netCents: grossCents,
      taxCents: 0n,
    };
  }

  const denominator = 10_000n + rateBasisPoints;

  // Round VAT to the nearest cent.
  const taxCents =
    (grossCents * rateBasisPoints + denominator / 2n) / denominator;

  return {
    netCents: grossCents - taxCents,
    taxCents,
  };
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

function validPaymentDetails(body: SaleInput): boolean {
  if (body.paymentMethod === "CASH") {
    return (
      typeof body.amountReceived === "string" &&
      /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/.test(body.amountReceived)
    );
  }

  if (body.paymentMethod === "MOBILE_MONEY") {
    return (
      (body.mobileMoneyProvider === "MTN_MOMO" ||
        body.mobileMoneyProvider === "ORANGE_MONEY") &&
      (body.paymentReference === undefined ||
        (typeof body.paymentReference === "string" &&
          body.paymentReference.trim().length <= 100))
    );
  }

  return false;
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
        !validSaleItems(body.items) ||
        !validPaymentDetails(body)
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
                isArchived: false,
              },
              select: {
                id: true,
                name: true,
                sellingMode: true,
                unitOfMeasure: true,
                price: true,
                trackInventory: true,
                taxRate: true,
              },
            });

            if (products.length !== body.items.length) {
              throw new SaleOperationError(
                "INVALID_PRODUCT",
                "One or more products do not exist, are inactive, or are archived.",
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

              // Customer-facing amount, including VAT.
              const grossCents = calculateSubtotal(item.quantity, unitPrice);

              // Extract VAT using the product's configured tax rate.
              const rateBasisPoints = decimalRateToBasisPoints(
                product.taxRate.toString(),
              );

              const { netCents, taxCents } = calculateInclusiveVat(
                grossCents,
                rateBasisPoints,
              );

              totalCents += grossCents;

              return {
                product,
                quantity: item.quantity,
                unitPrice,
                subtotal: centsToAmount(netCents),
                taxRate: product.taxRate.toString(),
                taxAmount: centsToAmount(taxCents),
                grossAmount: centsToAmount(grossCents),
                netCents,
                taxCents,
              };
            });

            const subtotalCents = preparedItems.reduce(
              (sum, item) => sum + item.netCents,
              0n,
            );

            const taxCents = preparedItems.reduce(
              (sum, item) => sum + item.taxCents,
              0n,
            );

            // Calculate payment details using the authoritative server total.
            let amountReceived: string | null = null;
            let changeAmount = "0.00";

            if (body.paymentMethod === "CASH") {
              const receivedCents = priceToCents(body.amountReceived!);

              if (receivedCents < totalCents) {
                throw new SaleOperationError(
                  "INVALID_PRODUCT",
                  "The amount received is less than the sale total.",
                );
              }

              amountReceived = centsToAmount(receivedCents);
              changeAmount = centsToAmount(receivedCents - totalCents);
            }

            const createdSale = await tx.sale.create({
              data: {
                transactionUuid: body.transactionUuid,
                cashierId: request.authUser!.id,
                terminalId: dbTerminal.id,
                totalAmount: centsToAmount(totalCents),
                subtotalAmount: centsToAmount(subtotalCents),
                taxAmount: centsToAmount(taxCents),
                currencyCode: "XAF",
                deviceCreatedAt: new Date(body.deviceCreatedAt),
                paymentMethod: body.paymentMethod,
                paymentStatus:
                  body.paymentMethod === "CASH"
                    ? "CASH_RECEIVED"
                    : "CASHIER_CONFIRMED",

                amountReceived,
                changeAmount,

                mobileMoneyProvider:
                  body.paymentMethod === "MOBILE_MONEY"
                    ? body.mobileMoneyProvider
                    : null,

                paymentReference:
                  body.paymentMethod === "MOBILE_MONEY"
                    ? body.paymentReference?.trim() || null
                    : null,
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
                  taxRate: item.taxRate,
                  taxAmount: item.taxAmount,
                },
              });

              createdItems.push({
                product: item.product,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                subtotal: item.subtotal,
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                grossAmount: item.grossAmount,
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
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                grossAmount: item.grossAmount,
              })),

              totalAmount: centsToAmount(totalCents),
              subtotalAmount: centsToAmount(subtotalCents),
              taxAmount: centsToAmount(taxCents),
              payment: {
                method: body.paymentMethod,
                amountReceived,
                changeAmount,
                mobileMoneyProvider:
                  body.paymentMethod === "MOBILE_MONEY"
                    ? body.mobileMoneyProvider
                    : null,
                paymentReference:
                  body.paymentMethod === "MOBILE_MONEY"
                    ? body.paymentReference?.trim() || null
                    : null,
              },
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

        // request.log.info({ sale }, "SALE_RESPONSE_DEBUG");

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

  // LIST SALES
  app.get(
    "/",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const query = request.query as {
        page?: string;
        limit?: string;
        terminalId?: string;
        cashierId?: string;
        dateFrom?: string;
        dateTo?: string;
        paymentMethod?: string;
        status?: string;
      };

      const user = request.authUser!;

      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

      // Validate payment method.
      if (
        query.paymentMethod &&
        !["CASH", "MOBILE_MONEY"].includes(query.paymentMethod)
      ) {
        return reply.code(400).send({
          message: "Invalid payment method filter.",
        });
      }

      // Validate sale status.
      if (query.status && !["COMPLETED", "VOIDED"].includes(query.status)) {
        return reply.code(400).send({
          message: "Invalid sale status filter.",
        });
      }

      // Validate date format (YYYY-MM-DD).
      const validDate = (value?: string) =>
        !value ||
        (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
          new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value));

      if (!validDate(query.dateFrom) || !validDate(query.dateTo)) {
        return reply.code(400).send({
          message: "Dates must use the YYYY-MM-DD format.",
        });
      }

      if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
        return reply.code(400).send({
          message: "The start date cannot be after the end date.",
        });
      }

      // Use an exclusive upper bound so the entire end date is included.
      const dateFilter: { gte?: Date; lt?: Date } = {};

      if (query.dateFrom) {
        dateFilter.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
      }

      if (query.dateTo) {
        const endExclusive = new Date(`${query.dateTo}T00:00:00.000Z`);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        dateFilter.lt = endExclusive;
      }

      // Cashiers can only see their own sales.
      // Admins and managers can filter by any cashier.
      const where = {
        ...(user.role === "CASHIER"
          ? { cashierId: user.id }
          : query.cashierId
            ? { cashierId: query.cashierId }
            : {}),

        ...(query.terminalId ? { terminalId: query.terminalId } : {}),

        ...(query.paymentMethod
          ? {
              paymentMethod: query.paymentMethod as "CASH" | "MOBILE_MONEY",
            }
          : {}),

        ...(query.status
          ? {
              status: query.status as "COMPLETED" | "VOIDED",
            }
          : {}),

        ...(Object.keys(dateFilter).length > 0
          ? { createdAt: dateFilter }
          : {}),
      };

      const [sales, total, summary] = await prisma.$transaction([
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

        prisma.sale.count({ where }),

        prisma.sale.aggregate({
          where,
          _sum: {
            totalAmount: true,
          },
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
        summary: {
          totalAmount: summary._sum.totalAmount?.toString() ?? "0",
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
