import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl =
  `postgresql://${encodeURIComponent(env("DB_USER"))}:` +
  `${encodeURIComponent(env("DB_PASSWORD"))}@` +
  `${env("DB_HOST")}:${env("DB_PORT")}/` +
  `${env("DB_NAME")}?schema=public`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
