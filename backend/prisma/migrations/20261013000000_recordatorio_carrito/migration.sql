-- Recordatorio de carrito abandonado: última actividad del cliente y cuándo se le recordó.
-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Cart_reminderSentAt_lastActivityAt_idx" ON "Cart"("reminderSentAt", "lastActivityAt");
