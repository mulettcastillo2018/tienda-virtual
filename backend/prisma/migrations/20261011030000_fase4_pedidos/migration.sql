-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingCountry" TEXT,
ADD COLUMN     "shippingFullName" TEXT,
ADD COLUMN     "shippingLine1" TEXT,
ADD COLUMN     "shippingLine2" TEXT,
ADD COLUMN     "shippingPhone" TEXT,
ADD COLUMN     "shippingPostalCode" TEXT,
ADD COLUMN     "shippingState" TEXT;

-- CreateIndex
CREATE INDEX "AddressChangeLog_addressId_idx" ON "AddressChangeLog"("addressId");

-- CreateIndex
CREATE INDEX "CartItem_productId_idx" ON "CartItem"("productId");

-- CreateIndex
CREATE INDEX "OAuthLoginCode_userId_idx" ON "OAuthLoginCode"("userId");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_shippingAddressId_idx" ON "Order"("shippingAddressId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Pqrs_userId_idx" ON "Pqrs"("userId");

-- CreateIndex
CREATE INDEX "Pqrs_orderId_idx" ON "Pqrs"("orderId");

-- CreateIndex
CREATE INDEX "PqrsStatusLog_pqrsId_idx" ON "PqrsStatusLog"("pqrsId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "ProductDiscountLog_productId_idx" ON "ProductDiscountLog"("productId");

-- CreateIndex
CREATE INDEX "ShippingAddress_userId_idx" ON "ShippingAddress"("userId");

-- CreateIndex
CREATE INDEX "StoreReview_userId_idx" ON "StoreReview"("userId");


-- Pedidos existentes: copia de la dirección con la que se despacharían hoy
-- (la que tenían enlazada). Los nuevos la copian al confirmar la compra.
UPDATE "Order" o
SET "shippingFullName" = a."fullName",
    "shippingLine1" = a."addressLine1",
    "shippingLine2" = a."addressLine2",
    "shippingCity" = a."city",
    "shippingState" = a."state",
    "shippingPostalCode" = a."postalCode",
    "shippingCountry" = a."country",
    "shippingPhone" = a."phone"
FROM "ShippingAddress" a
WHERE o."shippingAddressId" = a."id" AND o."shippingFullName" IS NULL;
