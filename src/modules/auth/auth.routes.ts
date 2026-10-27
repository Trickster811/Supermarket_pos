import type { FastifyInstance } from "fastify";
import argon2 from "argon2";

import { prisma } from "../../config/database.js";
import { authenticate } from "../../plugins/authenticate.js";

interface LoginBody {
  username: string;
  password: string;
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login
  app.post<{ Body: LoginBody }>(
    "/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
      schema: {
        body: {
          type: "object",
          required: ["username", "password"],
          additionalProperties: false,
          properties: {
            username: {
              type: "string",
              minLength: 1,
              maxLength: 100,
            },
            password: {
              type: "string",
              minLength: 1,
              maxLength: 200,
            },
          },
        },
      },
    },
    async (request, reply) => {
      const username = request.body.username.trim().toLowerCase();
      const password = request.body.password;

      const user = await prisma.user.findUnique({
        where: { username },
      });

      if (!user || !user.isActive) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid username or password",
        });
      }

      const passwordIsValid = await argon2.verify(
        user.passwordHash,
        password,
      );

      if (!passwordIsValid) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid username or password",
        });
      }

      const accessToken = app.jwt.sign(
        {
          sub: user.id,
          ver: user.tokenVersion,
        },
        {
          expiresIn: "8h",
        },
      );

      return reply.send({
        message: "Login successful",
        accessToken,
        tokenType: "Bearer",
        expiresIn: 28800,
        user: {
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          role: user.role,
        },
      });
    },
  );

  // GET /auth/me
  app.get(
    "/me",
    {
      preHandler: authenticate,
    },
    async (request) => {
      return {
        user: request.authUser,
      };
    },
  );
}