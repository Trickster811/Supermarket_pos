/*
  Warnings:

  - A unique constraint covering the columns `[stockReceiptItemId]` on the table `inventory_movements` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StockReceiptStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "stockReceiptItemId" UUID;

-- CreateTable
CREATE TABLE "stock_receipts" (
    "id" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "supplierName" TEXT,
    "supplierReference" TEXT,
    "status" "StockReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "receivedById" UUID,
    "terminalId" UUID,
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_receipt_items" (
    "id" UUID NOT NULL,
    "stockReceiptId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "unitOfMeasure" "UnitOfMeasure" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_receipts_receiptNumber_key" ON "stock_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "stock_receipts_status_idx" ON "stock_receipts"("status");

-- CreateIndex
CREATE INDEX "stock_receipts_createdAt_idx" ON "stock_receipts"("createdAt");

-- CreateIndex
CREATE INDEX "stock_receipts_receivedAt_idx" ON "stock_receipts"("receivedAt");

-- CreateIndex
CREATE INDEX "stock_receipt_items_stockReceiptId_idx" ON "stock_receipt_items"("stockReceiptId");

-- CreateIndex
CREATE INDEX "stock_receipt_items_productId_idx" ON "stock_receipt_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_stockReceiptItemId_key" ON "inventory_movements"("stockReceiptItemId");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_stockReceiptItemId_fkey" FOREIGN KEY ("stockReceiptItemId") REFERENCES "stock_receipt_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
