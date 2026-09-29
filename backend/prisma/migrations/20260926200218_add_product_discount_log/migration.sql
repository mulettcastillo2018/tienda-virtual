-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountLogId" TEXT;

-- CreateTable
CREATE TABLE "ProductDiscountLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "discountPercentage" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDiscountLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ProductDiscountLog" ADD CONSTRAINT "ProductDiscountLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDiscountLog" ADD CONSTRAINT "ProductDiscountLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_discountLogId_fkey" FOREIGN KEY ("discountLogId") REFERENCES "ProductDiscountLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
