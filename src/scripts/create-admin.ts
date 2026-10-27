import "dotenv/config";
import argon2 from "argon2";

import { prisma } from "../config/database.js";

async function main() {
  const fullName = process.env.INITIAL_ADMIN_FULL_NAME?.trim();
  const username = process.env.INITIAL_ADMIN_USERNAME
    ?.trim()
    .toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!fullName || !username || !password) {
    throw new Error(
      "Provide INITIAL_ADMIN_FULL_NAME, INITIAL_ADMIN_USERNAME, and INITIAL_ADMIN_PASSWORD",
    );
  }

  if (password.length < 12) {
    throw new Error("Administrator password must be at least 12 characters");
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (existingAdmin) {
    throw new Error(
      "An administrator already exists. Bootstrap is only allowed once.",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    throw new Error("This username is already in use");
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const admin = await prisma.user.create({
    data: {
      fullName,
      username,
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
    select: {
      id: true,
      fullName: true,
      username: true,
      role: true,
    },
  });

  console.log("Administrator created successfully:");
  console.log(admin);
}

main()
  .catch((error) => {
    console.error("Administrator creation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });