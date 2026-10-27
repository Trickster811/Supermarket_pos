import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "prisma/config";

const connectionString =
  `postgresql://${encodeURIComponent(env("DB_USER"))}:` +
  `${encodeURIComponent(env("DB_PASSWORD"))}@` +
  `${env("DB_HOST")}:${env("DB_PORT")}/` +
  `${env("DB_NAME")}?schema=public`;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaPg({
  connectionString,
});

export const prisma = new PrismaClient({
  adapter,
});
