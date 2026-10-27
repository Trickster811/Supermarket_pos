-- AlterTable
ALTER TABLE "terminals" ADD COLUMN     "deviceTokenHash" TEXT,
ADD COLUMN     "pairedAt" TIMESTAMP(3),
ADD COLUMN     "pairingCodeHash" TEXT,
ADD COLUMN     "pairingExpiresAt" TIMESTAMP(3);
