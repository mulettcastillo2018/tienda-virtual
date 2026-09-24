import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import {
  generateIntegritySignature,
  generateOrderReference,
  verifyWebhookChecksum,
} from "../services/wompi.service";
import { sendOrderConfirmationEmail } from "../services/email.service";

export const paymentsRouter = Router();

paymentsRouter.post("/wompi/initiate/:orderId", requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.orderId, userId: req.user!.userId },
  });
  if (!order) {
    res.status(404).json({ error: "Orden no encontrada" });
    return;
  }
  if (order.status !== "PENDING") {
    res.status(409).json({ error: "La orden ya no está pendiente de pago" });
    return;
  }

  const reference = generateOrderReference(order.id);
  const amountInCents = order.totalAmount * 100;
  const signature = generateIntegritySignature({
    reference,
    amountInCents,
    currency: "COP",
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      status: "PENDING",
      paymentReference: reference,
    },
  });

  res.json({
    reference,
    amountInCents,
    currency: "COP",
    signature,
    publicKey: process.env.WOMPI_PUBLIC_KEY,
  });
});

interface WompiWebhookEvent {
  event: string;
  data: {
    transaction: {
      id: string;
      reference: string;
      status: "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";
      payment_method_type?: string;
      amount_in_cents: number;
    };
  };
  signature: { properties: string[]; checksum: string };
  timestamp: number;
}

// Ruta pública — Wompi la invoca directamente. El body llega como Buffer crudo
// (ver app.use(express.raw(...)) en src/index.ts) para poder validar la firma
// exactamente sobre lo que Wompi envió.
paymentsRouter.post("/wompi/webhook", async (req, res) => {
  let event: WompiWebhookEvent;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Body inválido" });
    return;
  }

  const valid = verifyWebhookChecksum({
    signature: event.signature,
    data: event.data as unknown as Record<string, unknown>,
    timestamp: event.timestamp,
  });

  if (!valid) {
    res.status(401).json({ error: "Firma inválida" });
    return;
  }

  const { transaction } = event.data;

  const payment = await prisma.payment.findUnique({
    where: { paymentReference: transaction.reference },
    include: { order: { include: { items: { include: { product: true } }, shippingAddress: true, user: true } } },
  });

  if (!payment) {
    res.status(404).json({ error: "Pago no encontrado" });
    return;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: transaction.status,
      providerTransactionId: transaction.id,
      paymentMethod: transaction.payment_method_type,
      rawResponse: event as unknown as object,
    },
  });

  if (transaction.status === "APPROVED") {
    await prisma.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } });

    await sendOrderConfirmationEmail(
      payment.order.user.email,
      {
        id: payment.order.id,
        totalAmount: payment.order.totalAmount,
        shippingCost: payment.order.shippingCost,
        items: payment.order.items.map((item) => ({
          productName: item.product.name,
          quantity: item.quantity,
          priceAtPurchase: item.priceAtPurchase,
        })),
        shippingAddress: payment.order.shippingAddress,
      },
      {
        providerTransactionId: transaction.id,
        paymentMethod: transaction.payment_method_type ?? null,
      }
    );
  } else if (transaction.status === "DECLINED" || transaction.status === "VOIDED") {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: payment.orderId },
        include: { items: true },
      });

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }

      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    });
  }

  res.json({ received: true });
});
