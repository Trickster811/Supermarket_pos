import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "../config/database.js";

export type AuthenticatedTerminal = {
  id: string;
  terminalCode: string;
  deviceUuid: string | null;
};

declare module "fastify" {
  interface FastifyRequest {
    authTerminal?: AuthenticatedTerminal;
  }
}

export async function authenticateTerminal(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const terminalId = request.headers["x-terminal-id"];
  const deviceToken = request.headers["x-terminal-token"];

  if (
    typeof terminalId !== "string" ||
    typeof deviceToken !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      terminalId
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(deviceToken)
  ) {
    return reply.code(401).send({
      message: "Terminal authentication required.",
    });
  }

  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    select: {
      id: true,
      terminalCode: true,
      deviceUuid: true,
      deviceTokenHash: true,
      isActive: true,
    },
  });

  if (
    !terminal ||
    !terminal.isActive ||
    !terminal.deviceTokenHash ||
    !terminal.deviceUuid
  ) {
    return reply.code(401).send({
      message: "Terminal is not authorized.",
    });
  }

  const suppliedHash = createHash("sha256")
    .update(deviceToken, "utf8")
    .digest();

  const storedHash = Buffer.from(terminal.deviceTokenHash, "hex");

  if (
    storedHash.length !== suppliedHash.length ||
    !timingSafeEqual(storedHash, suppliedHash)
  ) {
    return reply.code(401).send({
      message: "Terminal is not authorized.",
    });
  }

  request.authTerminal = {
    id: terminal.id,
    terminalCode: terminal.terminalCode,
    deviceUuid: terminal.deviceUuid,
  };
}