import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate } from "../../plugins/authenticate.js";

type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

type AuthenticatedRequest = FastifyRequest & {
  authUser: {
    id: string;
    role: UserRole;
  };
};

type PrintAttemptBody = {
  printerName?: string;
  printerId?: string;
  terminalId?: string;
};

type PrintResultBody = {
  status: "SUCCESS" | "FAILED";
  errorMessage?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isManagerOrAdmin(role: UserRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function canAccessReceipt(
  user: AuthenticatedRequest["authUser"],
  cashierId: string,
): boolean {
  return isManagerOrAdmin(user.role) || user.id === cashierId;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findAccessibleReceipt(
  id: string,
  user: AuthenticatedRequest["authUser"],
) {
  if (!isUuid(id)) {
    return { error: "Invalid receipt ID.", statusCode: 400 } as const;
  }

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      sale: {
        select: {
          id: true,
          cashierId: true,
          terminalId: true,
          transactionUuid: true,
          totalAmount: true,
          currencyCode: true,
          status: true,
          createdAt: true,
          deviceCreatedAt: true,
          items: true,
        },
      },
    },
  });

  if (!receipt) {
    return { error: "Receipt not found.", statusCode: 404 } as const;
  }

  if (!canAccessReceipt(user, receipt.sale.cashierId)) {
    return {
      error: "You are not allowed to access this receipt.",
      statusCode: 403,
    } as const;
  }

  return { receipt } as const;
}

export const receiptRoutes: FastifyPluginAsync = async (app) => {
  // All receipt routes require authentication.
  app.addHook("preHandler", authenticate);

  // GET /receipts/:id
  // Retrieve a receipt by its database ID.
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as AuthenticatedRequest).authUser;

    const result = await findAccessibleReceipt(id, user);

    if ("error" in result) {
      return reply
        .code(result.statusCode ?? 500)
        .send({ message: result.error });
    }

    return reply.send({ receipt: result.receipt });
  });

  // GET /receipts/number/:receiptNumber
  // Retrieve a receipt by its human-readable receipt number.
  app.get("/number/:receiptNumber", async (request, reply) => {
    const { receiptNumber } = request.params as { receiptNumber: string };
    const user = (request as AuthenticatedRequest).authUser;

    if (!receiptNumber || receiptNumber.length > 100) {
      return reply.code(400).send({ message: "Invalid receipt number." });
    }

    const receipt = await prisma.receipt.findUnique({
      where: { receiptNumber },
      include: {
        sale: {
          select: {
            id: true,
            cashierId: true,
            terminalId: true,
            transactionUuid: true,
            totalAmount: true,
            currencyCode: true,
            status: true,
            createdAt: true,
            deviceCreatedAt: true,
            items: true,
          },
        },
      },
    });

    if (!receipt) {
      return reply.code(404).send({ message: "Receipt not found." });
    }

    if (!canAccessReceipt(user, receipt.sale.cashierId)) {
      return reply.code(403).send({
        message: "You are not allowed to access this receipt.",
      });
    }

    return reply.send({ receipt });
  });

  // GET /receipts/sale/:saleId
  // Retrieve the receipt associated with a sale.
  app.get("/sale/:saleId", async (request, reply) => {
    const { saleId } = request.params as { saleId: string };
    const user = (request as AuthenticatedRequest).authUser;

    if (!isUuid(saleId)) {
      return reply.code(400).send({ message: "Invalid sale ID." });
    }

    const receipt = await prisma.receipt.findUnique({
      where: { saleId },
      include: {
        sale: {
          select: {
            id: true,
            cashierId: true,
            terminalId: true,
            transactionUuid: true,
            totalAmount: true,
            currencyCode: true,
            status: true,
            createdAt: true,
            deviceCreatedAt: true,
            items: true,
          },
        },
      },
    });

    if (!receipt) {
      return reply.code(404).send({ message: "Receipt not found." });
    }

    if (!canAccessReceipt(user, receipt.sale.cashierId)) {
      return reply.code(403).send({
        message: "You are not allowed to access this receipt.",
      });
    }

    return reply.send({ receipt });
  });

  // GET /receipts/:id/print-attempts
  // Retrieve the printing history for a receipt.
  app.get("/:id/print-attempts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as AuthenticatedRequest).authUser;

    const result = await findAccessibleReceipt(id, user);

    if ("error" in result) {
      return reply
        .code(result.statusCode ?? 500)
        .send({ message: result.error });
    }

    const attempts = await prisma.receiptPrintAttempt.findMany({
      where: { receiptId: id },
      orderBy: { attemptNumber: "asc" },
    });

    return reply.send({ attempts });
  });

  // POST /receipts/:id/print-attempts
  // Create a new queued print attempt.
  app.post("/:id/print-attempts", async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as AuthenticatedRequest).authUser;

    const result = await findAccessibleReceipt(id, user);

    if ("error" in result) {
      return reply
        .code(result.statusCode ?? 500)
        .send({ message: result.error });
    }

    if (!isObject(request.body)) {
      return reply.code(400).send({ message: "Invalid print request." });
    }

    const body = request.body as PrintAttemptBody;

    if (
      body.printerName !== undefined &&
      (typeof body.printerName !== "string" ||
        body.printerName.trim().length === 0 ||
        body.printerName.length > 150)
    ) {
      return reply.code(400).send({ message: "Invalid printer name." });
    }

    if (
      body.printerId !== undefined &&
      (typeof body.printerId !== "string" ||
        body.printerId.trim().length === 0 ||
        body.printerId.length > 150)
    ) {
      return reply.code(400).send({ message: "Invalid printer ID." });
    }

    if (body.terminalId !== undefined && !isUuid(body.terminalId)) {
      return reply.code(400).send({ message: "Invalid terminal ID." });
    }

    if (body.terminalId) {
      const terminal = await prisma.terminal.findUnique({
        where: { id: body.terminalId },
        select: { id: true, isActive: true },
      });

      if (!terminal || !terminal.isActive) {
        return reply.code(400).send({
          message: "Terminal does not exist or is inactive.",
        });
      }
    }

    try {
      const attempt = await prisma.$transaction(
        async (tx) => {
          const latestAttempt = await tx.receiptPrintAttempt.findFirst({
            where: { receiptId: id },
            orderBy: { attemptNumber: "desc" },
            select: { attemptNumber: true },
          });

          const attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;

          const created = await tx.receiptPrintAttempt.create({
            data: {
              receiptId: id,
              attemptNumber,
              status: "QUEUED",
              printerName: body.printerName?.trim() ?? null,
              printerId: body.printerId?.trim() ?? null,
              requestedById: user.id,
              terminalId: body.terminalId ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              terminalId: body.terminalId ?? null,
              action: "RECEIPT_PRINT_REQUESTED",
              entityType: "ReceiptPrintAttempt",
              entityId: created.id,
              details: {
                receiptId: id,
                attemptNumber,
                printerName: body.printerName?.trim() ?? null,
                printerId: body.printerId?.trim() ?? null,
              },
            },
          });

          return created;
        },
        { isolationLevel: "Serializable" },
      );

      return reply.code(201).send({
        message: "Receipt print attempt queued.",
        attempt,
      });
    } catch (error) {
      request.log.error(error);

      return reply.code(409).send({
        message:
          "Could not create the print attempt. Please retry the request.",
      });
    }
  });

  // POST /receipts/:id/print-attempts/:attemptId/result
  // Record the result reported by the printing client.
  app.post("/:id/print-attempts/:attemptId/result", async (request, reply) => {
    const { id, attemptId } = request.params as {
      id: string;
      attemptId: string;
    };

    const user = (request as AuthenticatedRequest).authUser;

    const receiptResult = await findAccessibleReceipt(id, user);

    if ("error" in receiptResult) {
      return reply
        .code(receiptResult.statusCode ?? 500)
        .send({ message: receiptResult.error });
    }

    if (!isUuid(attemptId) || !isObject(request.body)) {
      return reply.code(400).send({ message: "Invalid print result request." });
    }

    const body = request.body as PrintResultBody;

    if (body.status !== "SUCCESS" && body.status !== "FAILED") {
      return reply.code(400).send({
        message: "Print status must be SUCCESS or FAILED.",
      });
    }

    if (
      body.errorMessage !== undefined &&
      (typeof body.errorMessage !== "string" || body.errorMessage.length > 1000)
    ) {
      return reply.code(400).send({ message: "Invalid error message." });
    }

    const attempt = await prisma.receiptPrintAttempt.findFirst({
      where: {
        id: attemptId,
        receiptId: id,
      },
    });

    if (!attempt) {
      return reply.code(404).send({ message: "Print attempt not found." });
    }

    // Make repeated reports of the same result safe.
    if (attempt.status === body.status) {
      return reply.send({
        message: "Print result was already recorded.",
        attempt,
      });
    }

    if (attempt.status !== "QUEUED") {
      return reply.code(409).send({
        message: "This print attempt already has a different final result.",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.receiptPrintAttempt.updateMany({
        where: {
          id: attemptId,
          receiptId: id,
          status: "QUEUED",
        },
        data: {
          status: body.status,
          errorMessage:
            body.status === "FAILED"
              ? body.errorMessage?.trim() || "Printing failed."
              : null,
          completedAt: new Date(),
        },
      });

      if (updateResult.count !== 1) {
        return null;
      }

      const updatedAttempt = await tx.receiptPrintAttempt.findUnique({
        where: { id: attemptId },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          terminalId: attempt.terminalId,
          action:
            body.status === "SUCCESS"
              ? "RECEIPT_PRINT_SUCCEEDED"
              : "RECEIPT_PRINT_FAILED",
          entityType: "ReceiptPrintAttempt",
          entityId: attemptId,
          details: {
            receiptId: id,
            attemptNumber: attempt.attemptNumber,
            status: body.status,
            errorMessage:
              body.status === "FAILED"
                ? body.errorMessage?.trim() || "Printing failed."
                : null,
          },
        },
      });

      return updatedAttempt;
    });

    if (!updated) {
      return reply.code(409).send({
        message: "This print attempt was already completed.",
      });
    }

    return reply.send({
      message: "Print result recorded.",
      attempt: updated,
    });
  });
};
