import type { FastifyInstance } from "fastify";
import argon2 from "argon2";

import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";

// Accepted request types
type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

interface CreateUserBody {
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
}

interface UpdateUserBody {
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

interface ResetPasswordBody {
  newPassword: string;
}

interface ListUsersQuery {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

const userSelect = {
  id: true,
  fullName: true,
  username: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

export async function userRoutes(app: FastifyInstance) {
  // All routes in this module require an administrator.
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRoles("ADMIN"));

  // --------------------------------------------------
  // CREATE USER
  // POST /users
  // --------------------------------------------------

  app.post<{ Body: CreateUserBody }>(
    "/",
    {
      schema: {
        body: {
          type: "object",
          required: ["fullName", "username", "password", "role"],
          additionalProperties: false,
          properties: {
            fullName: {
              type: "string",
              minLength: 2,
              maxLength: 150,
            },
            username: {
              type: "string",
              minLength: 3,
              maxLength: 100,
            },
            password: {
              type: "string",
              minLength: 12,
              maxLength: 200,
            },
            role: {
              type: "string",
              enum: ["ADMIN", "MANAGER", "CASHIER"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const fullName = request.body.fullName.trim();
      const username = request.body.username.trim().toLowerCase();
      const password = request.body.password;
      const role = request.body.role;

      if (!fullName || !username) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Full name and username cannot be empty",
        });
      }

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
      });

      try {
        const user = await prisma.$transaction(async (tx) => {
          const createdUser = await tx.user.create({
            data: {
              fullName,
              username,
              passwordHash,
              role,
            },
            select: userSelect,
          });

          await tx.auditLog.create({
            data: {
              userId: request.authUser!.id,
              action: "USER_CREATED",
              entityType: "User",
              entityId: createdUser.id,
              details: {
                username: createdUser.username,
                role: createdUser.role,
              },
            },
          });

          return createdUser;
        });

        return reply.code(201).send({
          message: "User created successfully",
          user,
        });
      } catch (error: any) {
        if (error.code === "P2002") {
          return reply.code(409).send({
            error: "Conflict",
            message: "This username is already in use",
          });
        }

        throw error;
      }
    },
  );

  // --------------------------------------------------
  // LIST AND SEARCH USERS
  // GET /users
  // --------------------------------------------------

  app.get<{ Querystring: ListUsersQuery }>("/", async (request) => {
    const { search, role, isActive, page = 1, limit = 20 } = request.query;

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const where = {
      ...(role ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search
        ? {
            OR: [
              {
                fullName: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                username: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: {
          createdAt: "desc",
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),

      prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  });

  // --------------------------------------------------
  // GET ONE USER
  // GET /users/:id
  // --------------------------------------------------

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: {
        id: request.params.id,
      },
      select: userSelect,
    });

    if (!user) {
      return reply.code(404).send({
        error: "NotFound",
        message: "User not found",
      });
    }

    return { user };
  });

  // --------------------------------------------------
  // UPDATE USER
  // PATCH /users/:id
  // --------------------------------------------------

  app.patch<{
    Params: { id: string };
    Body: UpdateUserBody;
  }>(
    "/:id",
    {
      schema: {
        body: {
          type: "object",
          minProperties: 1,
          additionalProperties: false,
          properties: {
            fullName: {
              type: "string",
              minLength: 2,
              maxLength: 150,
            },
            role: {
              type: "string",
              enum: ["ADMIN", "MANAGER", "CASHIER"],
            },
            isActive: {
              type: "boolean",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const targetId = request.params.id;
      const actorId = request.authUser!.id;
      const body = request.body;

      const existingUser = await prisma.user.findUnique({
        where: { id: targetId },
      });

      if (!existingUser) {
        return reply.code(404).send({
          error: "NotFound",
          message: "User not found",
        });
      }

      // Prevent an administrator from disabling or demoting
      // their own account through this endpoint.
      if (
        targetId === actorId &&
        (body.isActive === false ||
          (body.role !== undefined && body.role !== "ADMIN"))
      ) {
        return reply.code(400).send({
          error: "InvalidOperation",
          message: "You cannot deactivate or demote your own account",
        });
      }

      // Prevent removal of the last active administrator.
      const willLoseAdminAccess =
        existingUser.role === "ADMIN" &&
        existingUser.isActive &&
        (body.isActive === false ||
          (body.role !== undefined && body.role !== "ADMIN"));

      if (willLoseAdminAccess) {
        const activeAdminCount = await prisma.user.count({
          where: {
            role: "ADMIN",
            isActive: true,
          },
        });

        if (activeAdminCount <= 1) {
          return reply.code(400).send({
            error: "InvalidOperation",
            message: "At least one active administrator must remain",
          });
        }
      }

      const data = {
        ...(body.fullName !== undefined
          ? { fullName: body.fullName.trim() }
          : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      };

      const updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: targetId },
          data,
          select: userSelect,
        });

        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "USER_UPDATED",
            entityType: "User",
            entityId: targetId,
            details: {
              changes: data,
            },
          },
        });

        return user;
      });

      return {
        message: "User updated successfully",
        user: updatedUser,
      };
    },
  );

  // --------------------------------------------------
  // RESET USER PASSWORD
  // POST /users/:id/reset-password
  // --------------------------------------------------

  app.post<{
    Params: { id: string };
    Body: ResetPasswordBody;
  }>(
    "/:id/reset-password",
    {
      schema: {
        body: {
          type: "object",
          required: ["newPassword"],
          additionalProperties: false,
          properties: {
            newPassword: {
              type: "string",
              minLength: 12,
              maxLength: 200,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const targetId = request.params.id;

      const existingUser = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true },
      });

      if (!existingUser) {
        return reply.code(404).send({
          error: "NotFound",
          message: "User not found",
        });
      }

      const passwordHash = await argon2.hash(request.body.newPassword, {
        type: argon2.argon2id,
      });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: targetId },
          data: {
            passwordHash,
            tokenVersion: {
              increment: 1,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: request.authUser!.id,
            action: "USER_PASSWORD_RESET",
            entityType: "User",
            entityId: targetId,
          },
        });
      });

      return {
        message: "Password reset successfully",
      };
    },
  );
}
