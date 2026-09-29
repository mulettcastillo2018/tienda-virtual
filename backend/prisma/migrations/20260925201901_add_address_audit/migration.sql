/*
  Warnings:

  - Added the required column `updatedAt` to the `ShippingAddress` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ShippingAddress" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AddressChangeLog" (
    "id" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "previousData" JSONB NOT NULL,
    "newData" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressChangeLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AddressChangeLog" ADD CONSTRAINT "AddressChangeLog_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "ShippingAddress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
