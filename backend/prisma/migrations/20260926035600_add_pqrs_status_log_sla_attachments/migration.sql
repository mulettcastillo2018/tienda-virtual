/*
  Warnings:

  - Added the required column `dueAt` to the `Pqrs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Pqrs" ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "responseAttachmentUrl" TEXT;
UPDATE "Pqrs" SET "dueAt" = "createdAt" + INTERVAL '21 days' WHERE "dueAt" IS NULL;
ALTER TABLE "Pqrs" ALTER COLUMN "dueAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "PqrsStatusLog" (
    "id" TEXT NOT NULL,
    "pqrsId" TEXT NOT NULL,
    "fromStatus" "PqrsStatus",
    "toStatus" "PqrsStatus" NOT NULL,
    "comment" TEXT,
    "attachmentUrl" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsStatusLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PqrsStatusLog" ADD CONSTRAINT "PqrsStatusLog_pqrsId_fkey" FOREIGN KEY ("pqrsId") REFERENCES "Pqrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsStatusLog" ADD CONSTRAINT "PqrsStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
