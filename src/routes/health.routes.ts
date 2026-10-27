import type { FastifyInstance } from "fastify";
import { prisma } from "../config/database.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error(
        { err: error },
        "Database health check failed",
      );

      return reply.code(503).send({
        status: "error",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      });
    }
  });
}