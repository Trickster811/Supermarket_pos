import { prisma } from "../config/database.js";

async function testDatabase() {
  try {
    await prisma.$connect();
    console.log("--------------------------------");
    console.log("PostgreSQL connection successful");
    console.log("Database: supermarket_pos");
    console.log("Currency: XAF (FCFA)");
    console.log("--------------------------------");

  } catch (error) {
    console.error("Database connection failed:", error);
    process.exitCode = 1;

  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();