
import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";

const managerAccess = requireRoles("ADMIN", "MANAGER");

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const terminalCodePattern = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

type CreateTerminalInput = {
  terminalCode: string;
  name: string;
  deviceUuid?: string | null;
};

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export async function terminalRoutes(app: FastifyInstance) {
  // CREATE A TERMINAL
  app.post(
    "/",
    { preHandler: [authenticate, managerAccess] },
    async (request, reply) => {
      const body = request.body as CreateTerminalInput;

      if (
        typeof body?.terminalCode !== "string" ||
        typeof body?.name !== "string"
      ) {
        return reply.code(400).send({
          message: "Terminal code and name are required.",
        });
      }

      const terminalCode = body.terminalCode.trim().toUpperCase();
      const name = body.name.trim();

      if (!terminalCodePattern.test(terminalCode)) {
        return reply.code(400).send({
          message:
            "Terminal code must be 3-30 characters and contain only letters, numbers, hyphens, and underscores.",
        });
      }

      if (name.length < 2 || name.length > 100) {
        return reply.code(400).send({
          message: "Terminal name must contain between 2 and 100 characters.",
        });
      }

      if (
        body.deviceUuid !== undefined &&
        body.deviceUuid !== null &&
        !uuidPattern.test(body.deviceUuid)
      ) {
        return reply.code(400).send({
          message: "deviceUuid must be a valid UUID or null.",
        });
      }

      try {
        const terminal = await prisma.$transaction(async (tx) => {
          const created = await tx.terminal.create({
            data: {
              terminalCode,
              name,
              deviceUuid: body.deviceUuid ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "TERMINAL_CREATED",
              entityType: "Terminal",
              entityId: created.id,
              details: {
                terminalCode: created.terminalCode,
                name: created.name,
              },
            },
          });

          return created;
        });

        return reply.code(201).send(terminal);
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return reply.code(409).send({
            message: "A terminal with this code or device UUID already exists.",
          });
        }

        request.log.error(error);
        return reply.code(500).send({
          message: "Could not create terminal.",
        });
      }
    },
  );

  // LIST AND SEARCH TERMINALS
  app.get(
    "/",
    { preHandler: [authenticate, managerAccess] },
    async (request) => {
      const query = request.query as {
        search?: string;
        isActive?: string;
        page?: number;
        limit?: number;
      };

      const page = Math.max(1, Number(query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const search = query.search?.trim();

      const isActive =
        query.isActive === "true"
          ? true
          : query.isActive === "false"
            ? false
            : undefined;

      const where = {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(search
          ? {
              OR: [
                {
                  terminalCode: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  name: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              ],
            }
          : {}),
      };

      const [terminals, total] = await prisma.$transaction([
        prisma.terminal.findMany({
          where,
          include: {
            _count: {
              select: {
                sales: true,
                inventoryMovements: true,
                stockReceipts: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.terminal.count({ where }),
      ]);

      return {
        data: terminals,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
  );

  // GET TERMINAL DETAILS
  app.get(
    "/:id",
    { preHandler: [authenticate, managerAccess] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      if (!uuidPattern.test(id)) {
        return reply.code(400).send({ message: "Invalid terminal ID." });
      }

      const terminal = await prisma.terminal.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              sales: true,
              inventoryMovements: true,
              stockReceipts: true,
              receiptPrintAttempts: true,
              syncLogs: true,
            },
          },
          syncState: true,
        },
      });

      if (!terminal) {
        return reply.code(404).send({ message: "Terminal not found." });
      }

      return terminal;
    },
  );

  // UPDATE TERMINAL INFORMATION
  app.patch(
    "/:id",
    { preHandler: [authenticate, managerAccess] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<CreateTerminalInput>;

      if (!uuidPattern.test(id)) {
        return reply.code(400).send({ message: "Invalid terminal ID." });
      }

      if (
        body.name !== undefined &&
        (typeof body.name !== "string" ||
          body.name.trim().length < 2 ||
          body.name.trim().length > 100)
      ) {
        return reply.code(400).send({ message: "Invalid terminal name." });
      }

      if (
        body.deviceUuid !== undefined &&
        body.deviceUuid !== null &&
        !uuidPattern.test(body.deviceUuid)
      ) {
        return reply.code(400).send({
          message: "deviceUuid must be a valid UUID or null.",
        });
      }

      if (
        body.terminalCode !== undefined &&
        (typeof body.terminalCode !== "string" ||
          !terminalCodePattern.test(body.terminalCode.trim().toUpperCase()))
      ) {
        return reply.code(400).send({ message: "Invalid terminal code." });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const existing = await tx.terminal.findUnique({ where: { id } });

          if (!existing) return null;

          const updated = await tx.terminal.update({
            where: { id },
            data: {
              ...(body.name !== undefined
                ? { name: body.name.trim() }
                : {}),
              ...(body.terminalCode !== undefined
                ? { terminalCode: body.terminalCode.trim().toUpperCase() }
                : {}),
              ...(body.deviceUuid !== undefined
                ? { deviceUuid: body.deviceUuid }
                : {}),
            },
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "TERMINAL_UPDATED",
              entityType: "Terminal",
              entityId: id,
              details: {
                previousName: existing.name,
                newName: updated.name,
                previousCode: existing.terminalCode,
                newCode: updated.terminalCode,
              },
            },
          });

          return updated;
        });

        if (!result) {
          return reply.code(404).send({ message: "Terminal not found." });
        }

        return result;
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return reply.code(409).send({
            message: "The terminal code or device UUID is already in use.",
          });
        }

        request.log.error(error);
        return reply.code(500).send({
          message: "Could not update terminal.",
        });
      }
    },
  );

  // ACTIVATE OR DEACTIVATE A TERMINAL
  app.patch(
    "/:id/status",
    { preHandler: [authenticate, managerAccess] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { isActive?: boolean };

      if (!uuidPattern.test(id)) {
        return reply.code(400).send({ message: "Invalid terminal ID." });
      }

      if (typeof body?.isActive !== "boolean") {
        return reply.code(400).send({
          message: "isActive must be true or false.",
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const existing = await tx.terminal.findUnique({ where: { id } });

          if (!existing) return null;

          const updated = await tx.terminal.update({
            where: { id },
            data: { isActive: body.isActive },
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: body.isActive
                ? "TERMINAL_ACTIVATED"
                : "TERMINAL_DEACTIVATED",
              entityType: "Terminal",
              entityId: id,
              details: {
                terminalCode: existing.terminalCode,
                previousStatus: existing.isActive,
                newStatus: updated.isActive,
              },
            },
          });

          return updated;
        });

        if (!result) {
          return reply.code(404).send({ message: "Terminal not found." });
        }

        return result;
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          message: "Could not change terminal status.",
        });
      }
    },
  );
}
