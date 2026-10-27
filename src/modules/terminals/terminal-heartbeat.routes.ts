import type { FastifyInstance } from "fastify";
import { prisma } from "../../config/database.js";
import { authenticate } from "../../plugins/authenticate.js";
import { authenticateTerminal } from "../../plugins/terminal-auth.js";

const ONLINE_THRESHOLD_MS = 60_000;

export async function terminalHeartbeatRoutes(app: FastifyInstance) {
  // A paired checkout phone calls this endpoint periodically.
  app.post(
    "/heartbeat",
    {
      preHandler: [authenticateTerminal],
    },
    async (request, reply) => {
      const terminal = request.authTerminal;

      if (!terminal) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Terminal authentication required",
        });
      }

      const updatedTerminal = await prisma.terminal.update({
        where: {
          id: terminal.id,
        },
        data: {
          lastSeenAt: new Date(),
        },
        select: {
          id: true,
          terminalCode: true,
          name: true,
          lastSeenAt: true,
        },
      });

      return reply.send({
        success: true,
        message: "Heartbeat received",
        terminal: updatedTerminal,
        serverTime: new Date().toISOString(),
      });
    },
  );

  // Admin/manager monitoring endpoint.
  app.get(
    "/monitoring",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = request.authUser;

      if (!user) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required",
        });
      }

      if (!["ADMIN", "MANAGER"].includes(user.role)) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Only administrators and managers can monitor terminals",
        });
      }

      const terminals = await prisma.terminal.findMany({
        orderBy: {
          name: "asc",
        },
        select: {
          id: true,
          terminalCode: true,
          name: true,
          isActive: true,
          deviceUuid: true,
          pairedAt: true,
          lastSeenAt: true,
        },
      });

      const now = Date.now();

      const results = terminals.map((terminal) => {
        let status:
          | "online"
          | "offline"
          | "never_seen"
          | "unpaired"
          | "disabled";

        if (!terminal.isActive) {
          status = "disabled";
        } else if (!terminal.deviceUuid) {
          status = "unpaired";
        } else if (!terminal.lastSeenAt) {
          status = "never_seen";
        } else {
          const elapsed = now - terminal.lastSeenAt.getTime();

          status = elapsed <= ONLINE_THRESHOLD_MS ? "online" : "offline";
        }

        return {
          id: terminal.id,
          terminalCode: terminal.terminalCode,
          name: terminal.name,
          isActive: terminal.isActive,
          isPaired: terminal.deviceUuid !== null,
          pairedAt: terminal.pairedAt,
          lastSeenAt: terminal.lastSeenAt,
          status,
          secondsSinceLastSeen: terminal.lastSeenAt
            ? Math.max(
                0,
                Math.floor((now - terminal.lastSeenAt.getTime()) / 1000),
              )
            : null,
        };
      });

      return reply.send({
        success: true,
        total: results.length,
        online: results.filter((t) => t.status === "online").length,
        offline: results.filter((t) => t.status === "offline").length,
        neverSeen: results.filter((t) => t.status === "never_seen").length,
        unpaired: results.filter((t) => t.status === "unpaired").length,
        disabled: results.filter((t) => t.status === "disabled").length,
        terminals: results,
        serverTime: new Date().toISOString(),
      });
    },
  );
}
