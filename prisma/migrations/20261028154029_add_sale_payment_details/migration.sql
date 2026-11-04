-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY');

-- CreateEnum
CREATE TYPE "MobileMoneyProvider" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CASH_RECEIVED', 'CASHIER_CONFIRMED', 'PROVIDER_VERIFIED');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "amountReceived" DECIMAL(14,2),
ADD COLUMN     "changeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "mobileMoneyProvider" "MobileMoneyProvider",
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'CASH_RECEIVED';
