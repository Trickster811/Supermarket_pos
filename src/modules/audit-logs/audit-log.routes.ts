import type { FastifyInstance } from "fastify";

import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";

type AuditLogQuery = {
  search?: string;
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

export async function auditLogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRoles("ADMIN", "MANAGER"));

  // --------------------------------------------------
  // LIST AND FILTER AUDIT LOGS
  // GET /audit-logs
  // --------------------------------------------------

  app.get<{ Querystring: AuditLogQuery }>(
    "/",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            search: { type: "string", maxLength: 150 },
            action: { type: "string", maxLength: 100 },
            entityType: { type: "string", maxLength: 100 },
            userId: { type: "string", format: "uuid" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const {
        search,
        action,
        entityType,
        userId,
        startDate,
        endDate,
        page = 1,
        limit = 20,
      } = request.query;

      const safePage = Math.max(1, page);
      const safeLimit = Math.min(100, Math.max(1, limit));

      const createdAt: {
        gte?: Date;
        lt?: Date;
      } = {};

      if (startDate) {
        createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      }

      if (endDate) {
        const end = new Date(`${endDate}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        createdAt.lt = end;
      }

      if (startDate && endDate && startDate > endDate) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "startDate cannot be later than endDate",
        });
      }

      const where = {
        ...(action ? { action } : {}),
        ...(entityType ? { entityType } : {}),
        ...(userId ? { userId } : {}),
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
        ...(search
          ? {
              OR: [
                {
                  action: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  entityType: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  user: {
                    is: {
                      fullName: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
                {
                  user: {
                    is: {
                      username: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      };

      const [logs, total] = await prisma.$transaction([
        prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                username: true,
                role: true,
              },
            },
            terminal: {
              select: {
                id: true,
                terminalCode: true,
                name: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        }),

        prisma.auditLog.count({ where }),
      ]);

      return {
        logs,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages: Math.ceil(total / safeLimit),
        },
      };
    },
  );
}
