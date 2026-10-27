import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env.js";
import { prisma } from "./config/database.js";

import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { categoryRoutes } from "./modules/categories/category.routes.js";
import { productRoutes } from "./modules/products/product.routes.js";
import { inventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { stockReceiptRoutes } from "./modules/stock-receipts/stock-receipt.routes.js";
import { saleRoutes } from "./modules/sales/sale.routes.js";
import { terminalRoutes } from "./modules/terminals/terminal.routes.js";
import { terminalPairingRoutes } from "./modules/terminals/terminal-pairing.routes.js";
import { receiptRoutes } from "./modules/receipts/receipt.routes.js";
import { terminalHeartbeatRoutes } from "./modules/terminals/terminal-heartbeat.routes.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.decorateRequest("authUser", null);

  app.register(cors, {
    origin: true,
  });

  app.register(rateLimit, {
    global: false,
  });

  app.register(jwt, {
    secret: env.jwtSecret,
  });

  app.register(healthRoutes);

  app.register(authRoutes, { prefix: "/auth" });
  app.register(userRoutes, { prefix: "/users" });
  app.register(categoryRoutes, { prefix: "/categories" });
  app.register(productRoutes, { prefix: "/products" });
  app.register(inventoryRoutes, { prefix: "/inventory" });
  app.register(stockReceiptRoutes, { prefix: "/stock-receipts" });
  app.register(saleRoutes, { prefix: "/sales" });
  app.register(terminalRoutes, { prefix: "/terminals" });
  app.register(terminalPairingRoutes, { prefix: "/terminals" });
  app.register(terminalHeartbeatRoutes, { prefix: "/terminals" });
  app.register(receiptRoutes, { prefix: "/receipts" });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
