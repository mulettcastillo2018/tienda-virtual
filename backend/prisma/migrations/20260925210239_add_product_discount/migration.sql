-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discountPercentage" INTEGER;

-- AlterTable
ALTER TABLE "ShippingAddress" ALTER COLUMN "updatedAt" DROP DEFAULT;
