
import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate, requireRoles } from "../../plugins/authenticate.js";

const managerAccess = requireRoles("ADMIN", "MANAGER");

export async function categoryRoutes(app: FastifyInstance) {
  // Create a category
  app.post(
    "/",
    {
      preHandler: [authenticate, managerAccess],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            description: { type: "string", maxLength: 500 },
            parentId: { type: ["string", "null"] },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        description?: string;
        parentId?: string | null;
      };

      const name = body.name.trim();

      if (!name) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Category name cannot be empty",
        });
      }

      if (body.parentId) {
        const parent = await prisma.category.findUnique({
          where: { id: body.parentId },
          select: { id: true },
        });

        if (!parent) {
          return reply.code(404).send({
            error: "NotFound",
            message: "Parent category not found",
          });
        }
      }

      const category = await prisma.$transaction(async (tx) => {
        const created = await tx.category.create({
          data: {
            name,
            description: body.description?.trim() || null,
            parentId: body.parentId ?? null,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: request.authUser!.id,
            action: "CATEGORY_CREATED",
            entityType: "Category",
            entityId: created.id,
          },
        });

        return created;
      });

      return reply.code(201).send(category);
    },
  );

  // List and search categories
  app.get(
    "/",
    { preHandler: [authenticate] },
    async (request) => {
      const query = request.query as {
        search?: string;
        isActive?: string;
        parentId?: string;
      };

      const categories = await prisma.category.findMany({
        where: {
          ...(query.search
            ? { name: { contains: query.search, mode: "insensitive" } }
            : {}),
          ...(query.isActive === "true"
            ? { isActive: true }
            : query.isActive === "false"
              ? { isActive: false }
              : {}),
          ...(query.parentId === "null"
            ? { parentId: null }
            : query.parentId
              ? { parentId: query.parentId }
              : {}),
        },
        include: {
          parent: {
            select: { id: true, name: true },
          },
          _count: {
            select: { products: true, children: true },
          },
        },
        orderBy: { name: "asc" },
      });

      return { data: categories, count: categories.length };
    },
  );

  // Retrieve one category
  app.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const category = await prisma.category.findUnique({
        where: { id: request.params.id },
        include: {
          parent: true,
          children: true,
          products: {
            select: {
              id: true,
              sku: true,
              name: true,
              barcode: true,
              pluCode: true,
              sellingMode: true,
              unitOfMeasure: true,
              price: true,
              isActive: true,
            },
          },
        },
      });

      if (!category) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Category not found",
        });
      }

      return category;
    },
  );

  // Update category details or parent
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
            name: { type: "string", minLength: 1, maxLength: 100 },
            description: {
              type: ["string", "null"],
              maxLength: 500,
            },
            parentId: { type: ["string", "null"] },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        name?: string;
        description?: string | null;
        parentId?: string | null;
      };

      const existing = await prisma.category.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Category not found",
        });
      }

      if (body.name !== undefined && !body.name.trim()) {
        return reply.code(400).send({
          error: "ValidationError",
          message: "Category name cannot be empty",
        });
      }

      if (body.parentId !== undefined && body.parentId !== null) {
        if (body.parentId === request.params.id) {
          return reply.code(400).send({
            error: "ValidationError",
            message: "A category cannot be its own parent",
          });
        }

        // Walk up the proposed parent's ancestors to prevent cycles.
        let currentId: string | null = body.parentId;

        while (currentId) {
          if (currentId === request.params.id) {
            return reply.code(400).send({
              error: "ValidationError",
              message: "This parent would create a category cycle",
            });
          }

          const ancestor: { parentId: string | null } | null =
            await prisma.category.findUnique({
              where: { id: currentId },
              select: { parentId: true },
            });

          if (!ancestor) {
            return reply.code(404).send({
              error: "NotFound",
              message: "Parent category not found",
            });
          }

          currentId = ancestor.parentId;
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.category.update({
          where: { id: request.params.id },
          data: {
            ...(body.name !== undefined ? { name: body.name.trim() } : {}),
            ...(body.description !== undefined
              ? { description: body.description?.trim() || null }
              : {}),
            ...(body.parentId !== undefined
              ? { parentId: body.parentId }
              : {}),
          },
        });

        await tx.auditLog.create({
          data: {
            userId: request.authUser!.id,
            action: "CATEGORY_UPDATED",
            entityType: "Category",
            entityId: result.id,
          },
        });

        return result;
      });

      return updated;
    },
  );

  // Activate or deactivate a category
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

      const existing = await prisma.category.findUnique({
        where: { id: request.params.id },
      });

      if (!existing) {
        return reply.code(404).send({
          error: "NotFound",
          message: "Category not found",
        });
      }

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.category.update({
          where: { id: request.params.id },
          data: { isActive: body.isActive },
        });

        await tx.auditLog.create({
          data: {
            userId: request.authUser!.id,
            action: body.isActive
              ? "CATEGORY_ACTIVATED"
              : "CATEGORY_DEACTIVATED",
            entityType: "Category",
            entityId: result.id,
          },
        });

        return result;
      });

      return updated;
    },
  );
}
