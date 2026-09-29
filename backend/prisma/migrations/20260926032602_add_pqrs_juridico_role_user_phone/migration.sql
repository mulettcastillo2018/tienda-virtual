/*
  Warnings:

  - Added the required column `phone` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PqrsType" AS ENUM ('PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA');

-- CreateEnum
CREATE TYPE "PqrsStatus" AS ENUM ('RECIBIDO', 'EN_PROCESO', 'RESUELTO', 'CERRADO');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'JURIDICO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT 'sin-telefono';
ALTER TABLE "User" ALTER COLUMN "phone" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Pqrs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PqrsType" NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "PqrsStatus" NOT NULL DEFAULT 'RECIBIDO',
    "orderId" TEXT,
    "response" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pqrs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
