-- CreateEnum
CREATE TYPE "PaymentOption" AS ENUM ('ONLINE', 'CASH_ON_DELIVERY');

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'CASH';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "codFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guestEmail" TEXT,
ADD COLUMN     "paymentOption" "PaymentOption" NOT NULL DEFAULT 'ONLINE',
ALTER COLUMN "userId" DROP NOT NULL,
ALTER COLUMN "shippingAddressId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "codEnabled" BOOLEAN NOT NULL DEFAULT false,
    "codCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "codMaxAmount" INTEGER NOT NULL DEFAULT 500000,
    "codFee" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_paymentOption_status_idx" ON "Order"("paymentOption", "status");


-- Configuración inicial (editable en el panel): contra entrega en las
-- ciudades principales, hasta $500.000 y sin recargo.
INSERT INTO "StoreSettings" ("id", "codEnabled", "codCities", "codMaxAmount", "codFee", "updatedAt")
VALUES ('main', true, ARRAY['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga'], 500000, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
