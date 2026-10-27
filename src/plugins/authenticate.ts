import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import { prisma } from "../config/database.js";
import type { UserRole } from "./auth.types.js";

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({
      error: "Unauthorized",
      message: "A valid access token is required",
    });
    return;
  }

  const claims = request.user as { sub?: string; ver?: number };

  if (!claims.sub) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid access token",
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      tokenVersion: true,
    },
  });

  if (!user || !user.isActive || claims.ver !== user.tokenVersion) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "This account is inactive or its session has expired",
    });
    return;
  }

  request.authUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role as UserRole,
  };
}

export function requireRoles(
  ...allowedRoles: UserRole[]
): preHandlerHookHandler {
  return async (request, reply) => {
    if (!request.authUser) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Authentication is required",
      });
    }

    if (!allowedRoles.includes(request.authUser.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "You do not have permission to perform this action",
      });
    }
  };
}
