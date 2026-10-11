-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('DATA_PROCESSING', 'MARKETING');

-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('RETRACTO', 'REVERSION');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FiscalDocumentType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "ContactInfo" ADD COLUMN     "legalName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "nit" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billingIdNumber" TEXT,
ADD COLUMN     "billingIdType" TEXT,
ADD COLUMN     "billingName" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "taxRate" INTEGER NOT NULL DEFAULT 19;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "taxRate" INTEGER NOT NULL DEFAULT 19;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privacyAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "privacyVersion" TEXT;

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "email" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "ReturnType" NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "cause" TEXT,
    "customerNote" TEXT,
    "storeNote" TEXT,
    "refundReference" TEXT,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "alanubeUrl" TEXT NOT NULL DEFAULT 'https://sandbox-api.alegra.com/e-provider/col/v1',
    "alanubeToken" TEXT,
    "alanubeCompanyId" TEXT,
    "resolutionNumber" TEXT,
    "prefix" TEXT,
    "rangeFrom" INTEGER,
    "rangeTo" INTEGER,
    "startDate" TEXT,
    "endDate" TEXT,
    "technicalKey" TEXT,
    "nextNumber" INTEGER,
    "creditNotePrefix" TEXT NOT NULL DEFAULT 'NC',
    "creditNoteNext" INTEGER NOT NULL DEFAULT 1,
    "shippingTaxRate" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "FiscalDocumentType" NOT NULL,
    "prefix" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "content" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "alanubeId" TEXT,
    "uniqueCode" TEXT,
    "qr" TEXT,
    "message" TEXT,
    "errors" TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "cancelsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

-- CreateIndex
CREATE INDEX "ConsentRecord_orderId_idx" ON "ConsentRecord"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_idempotencyKey_key" ON "FiscalDocument"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_cancelsId_key" ON "FiscalDocument"("cancelsId");

-- CreateIndex
CREATE INDEX "FiscalDocument_status_nextAttemptAt_idx" ON "FiscalDocument"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "FiscalDocument_orderId_idx" ON "FiscalDocument"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_type_prefix_number_key" ON "FiscalDocument"("type", "prefix", "number");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_cancelsId_fkey" FOREIGN KEY ("cancelsId") REFERENCES "FiscalDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Comerciante de la demo: se completa en el panel (Contacto) con la razón
-- social y el NIT reales antes de vender.
UPDATE "ContactInfo" SET "legalName" = 'Tienda Virtual (sitio de demostración)' WHERE "legalName" = '';

-- Facturación electrónica apagada hasta configurarla.
INSERT INTO "FiscalSettings" ("id", "updatedAt") VALUES ('main', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
