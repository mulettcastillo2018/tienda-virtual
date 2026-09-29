-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_provider_providerId_key" ON "User"("provider", "providerId");
