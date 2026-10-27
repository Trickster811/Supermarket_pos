import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import argon2 from "argon2";
import { randomInt, randomUUID, randomBytes, createHash } from "node:crypto";
import { prisma } from "../../config/database.js";
import { authenticate } from "../../plugins/authenticate.js";

type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

type AuthenticatedRequest = FastifyRequest & {
  authUser: {
    id: string;
    role: UserRole;
  };
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isManagerOrAdmin(role: UserRole): boolean {
  return role === "ADMIN" || role === "MANAGER";
}

function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export const terminalPairingRoutes: FastifyPluginAsync = async (app) => {
  //   app.addHook("preHandler", authenticate);

  // -------------------------------------------------------
  // POST /terminals/:id/pairing-code
  // Generate a temporary pairing code for a terminal.
  // ADMIN and MANAGER only.
  // -------------------------------------------------------
  app.post(
    "/:id/pairing-code",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = (request as AuthenticatedRequest).authUser;

      if (!isManagerOrAdmin(user.role)) {
        return reply.code(403).send({
          message: "You are not allowed to generate pairing codes.",
        });
      }

      if (!isUuid(id)) {
        return reply.code(400).send({ message: "Invalid terminal ID." });
      }

      const terminal = await prisma.terminal.findUnique({
        where: { id },
        select: {
          id: true,
          terminalCode: true,
          isActive: true,
          deviceTokenHash: true,
        },
      });

      if (!terminal) {
        return reply.code(404).send({ message: "Terminal not found." });
      }

      if (!terminal.isActive) {
        return reply.code(409).send({
          message: "An inactive terminal cannot be paired.",
        });
      }

      if (terminal.deviceTokenHash) {
        return reply.code(409).send({
          message: "This terminal is already paired. Unpair it first.",
        });
      }

      // Generate a cryptographically random six-digit code.
      const pairingCode = randomInt(0, 1_000_000).toString().padStart(6, "0");

      const pairingCodeHash = await argon2.hash(pairingCode);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      try {
        const result = await prisma.$transaction(async (tx) => {
          // Conditional update prevents overwriting an active pairing.
          const update = await tx.terminal.updateMany({
            where: {
              id,
              isActive: true,
              deviceTokenHash: null,
            },
            data: {
              pairingCodeHash,
              pairingExpiresAt: expiresAt,
            },
          });

          if (update.count !== 1) {
            return false;
          }

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "TERMINAL_PAIRING_CODE_GENERATED",
              entityType: "Terminal",
              entityId: id,
              details: {
                terminalCode: terminal.terminalCode,
                expiresAt: expiresAt.toISOString(),
              },
            },
          });

          return true;
        });

        if (!result) {
          return reply.code(409).send({
            message: "Terminal state changed. Please try again.",
          });
        }

        // Return the code only once. Never log it or store it in plaintext.
        return reply.code(201).send({
          message: "Pairing code generated.",
          terminalCode: terminal.terminalCode,
          pairingCode,
          expiresAt: expiresAt.toISOString(),
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          message: "Could not generate pairing code.",
        });
      }
    },
  );

  // -------------------------------------------------------
  // POST /terminals/pair
  // Android phone exchanges its pairing code for a device token.
  // This endpoint requires no user JWT; the pairing code is
  // the temporary authorization credential.
  // -------------------------------------------------------
  app.post(
    "/pair",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = request.body as
        | {
            terminalCode?: unknown;
            pairingCode?: unknown;
          }
        | undefined;

      if (
        !body ||
        typeof body.terminalCode !== "string" ||
        typeof body.pairingCode !== "string" ||
        !/^[0-9]{6}$/.test(body.pairingCode) ||
        body.terminalCode.trim().length === 0 ||
        body.terminalCode.length > 50
      ) {
        return reply.code(400).send({
          message: "Invalid pairing request.",
        });
      }

      const terminalCode = body.terminalCode.trim();
      const pairingCode = body.pairingCode;

      const terminal = await prisma.terminal.findUnique({
        where: { terminalCode },
        select: {
          id: true,
          terminalCode: true,
          isActive: true,
          pairingCodeHash: true,
          pairingExpiresAt: true,
          deviceTokenHash: true,
        },
      });

      // Use a generic error to avoid disclosing terminal registration state.
      if (
        !terminal ||
        !terminal.isActive ||
        !terminal.pairingCodeHash ||
        !terminal.pairingExpiresAt ||
        terminal.pairingExpiresAt.getTime() <= Date.now() ||
        terminal.deviceTokenHash
      ) {
        return reply.code(401).send({
          message: "Invalid or expired pairing code.",
        });
      }

      const codeMatches = await argon2.verify(
        terminal.pairingCodeHash,
        pairingCode,
      );

      if (!codeMatches) {
        return reply.code(401).send({
          message: "Invalid or expired pairing code.",
        });
      }

      // Generate a long, unpredictable credential for the phone.
      const deviceToken = randomBytes(32).toString("base64url");
      const deviceTokenHash = hashDeviceToken(deviceToken);
      const deviceUuid = randomUUID();
      const pairedAt = new Date();

      try {
        const paired = await prisma.$transaction(async (tx) => {
          // Only one request can consume this pairing code.
          const update = await tx.terminal.updateMany({
            where: {
              id: terminal.id,
              isActive: true,
              pairingCodeHash: terminal.pairingCodeHash,
              pairingExpiresAt: { gt: pairedAt },
              deviceTokenHash: null,
            },
            data: {
              deviceUuid,
              deviceTokenHash,
              pairedAt,
              pairingCodeHash: null,
              pairingExpiresAt: null,
            },
          });

          if (update.count !== 1) {
            return false;
          }

          await tx.auditLog.create({
            data: {
              action: "TERMINAL_PAIRED",
              entityType: "Terminal",
              entityId: terminal.id,
              details: {
                terminalCode: terminal.terminalCode,
                deviceUuid,
                pairedAt: pairedAt.toISOString(),
              },
            },
          });

          return true;
        });

        if (!paired) {
          return reply.code(409).send({
            message: "Pairing code has already been used or expired.",
          });
        }

        // This is the only time the plaintext token is returned.
        return reply.code(200).send({
          message: "Terminal paired successfully.",
          terminalId: terminal.id,
          terminalCode: terminal.terminalCode,
          deviceUuid,
          deviceToken,
          pairedAt: pairedAt.toISOString(),
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          message: "Could not complete terminal pairing.",
        });
      }
    },
  );

  // -------------------------------------------------------
  // POST /terminals/:id/unpair
  // Revoke the device credential.
  // ADMIN and MANAGER only.
  // -------------------------------------------------------
  app.post(
    "/:id/unpair",
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = (request as AuthenticatedRequest).authUser;

      if (!isManagerOrAdmin(user.role)) {
        return reply.code(403).send({
          message: "You are not allowed to unpair terminals.",
        });
      }

      if (!isUuid(id)) {
        return reply.code(400).send({ message: "Invalid terminal ID." });
      }

      const terminal = await prisma.terminal.findUnique({
        where: { id },
        select: {
          id: true,
          terminalCode: true,
          deviceTokenHash: true,
        },
      });

      if (!terminal) {
        return reply.code(404).send({ message: "Terminal not found." });
      }

      if (!terminal.deviceTokenHash) {
        return reply.code(409).send({
          message: "This terminal is not currently paired.",
        });
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.terminal.update({
            where: { id },
            data: {
              deviceUuid: null,
              deviceTokenHash: null,
              pairedAt: null,
              pairingCodeHash: null,
              pairingExpiresAt: null,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              action: "TERMINAL_UNPAIRED",
              entityType: "Terminal",
              entityId: id,
              details: {
                terminalCode: terminal.terminalCode,
              },
            },
          });
        });

        return reply.send({
          message: "Terminal unpaired successfully.",
          terminalId: id,
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          message: "Could not unpair terminal.",
        });
      }
    },
  );
};
