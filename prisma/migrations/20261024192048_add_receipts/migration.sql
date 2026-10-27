-- CreateEnum
CREATE TYPE "PrintAttemptStatus" AS ENUM ('QUEUED', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "saleId" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_print_attempts" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "PrintAttemptStatus" NOT NULL DEFAULT 'QUEUED',
    "printerName" TEXT,
    "printerId" TEXT,
    "requestedById" UUID,
    "terminalId" UUID,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "receipt_print_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_saleId_key" ON "receipts"("saleId");

-- CreateIndex
CREATE INDEX "receipts_issuedAt_idx" ON "receipts"("issuedAt");

-- CreateIndex
CREATE INDEX "receipt_print_attempts_status_idx" ON "receipt_print_attempts"("status");

-- CreateIndex
CREATE INDEX "receipt_print_attempts_attemptedAt_idx" ON "receipt_print_attempts"("attemptedAt");

-- CreateIndex
CREATE INDEX "receipt_print_attempts_terminalId_idx" ON "receipt_print_attempts"("terminalId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_print_attempts_receiptId_attemptNumber_key" ON "receipt_print_attempts"("receiptId", "attemptNumber");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_print_attempts" ADD CONSTRAINT "receipt_print_attempts_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_print_attempts" ADD CONSTRAINT "receipt_print_attempts_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_print_attempts" ADD CONSTRAINT "receipt_print_attempts_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "terminals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
