import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { calculateShippingQuote } from "../services/carrier.service";
import { sendShippingNotificationEmail } from "../services/email.service";

export const ordersRouter = Router();

const checkoutSchema = z.object({
  shippingAddressId: z.string().min(1),
});

ordersRouter.post("/checkout", requireAuth, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = req.user!.userId;
  const { shippingAddressId } = parsed.data;

  const address = await prisma.shippingAddress.findFirst({
    where: { id: shippingAddressId, userId },
  });
  if (!address) {
    res.status(404).json({ error: "Dirección de envío no encontrada" });
    return;
  }

  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: { items: { include: { product: true } } },
  });
  if (!cart || cart.items.length === 0) {
    res.status(400).json({ error: "El carrito está vacío" });
    return;
  }

  for (const item of cart.items) {
    if (item.product.stock < item.quantity) {
      res.status(409).json({ error: `Sin stock suficiente de "${item.product.name}"` });
      return;
    }
  }

  const totalWeightInGrams = cart.items.reduce(
    (sum, item) => sum + item.product.weightInGrams * item.quantity,
    0
  );
  const shippingQuote = calculateShippingQuote(address.postalCode, totalWeightInGrams);

  const subtotal = cart.items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const totalAmount = subtotal + shippingQuote.cost;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId,
        shippingAddressId,
        totalAmount,
        shippingCost: shippingQuote.cost,
        carrier: shippingQuote.carrier,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            priceAtPurchase: item.product.price,
          })),
        },
      },
      include: { items: true },
    });

    // Reserva de inventario.
    for (const item of cart.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return created;
  });

  res.status(201).json(order);
});

ordersRouter.get("/:id", requireAuth, async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { items: { include: { product: true } }, shippingAddress: true, payments: true },
  });
  if (!order) {
    res.status(404).json({ error: "Orden no encontrada" });
    return;
  }
  res.json(order);
});

// --- Administración de despachos ---

const dispatchSchema = z.object({
  carrier: z.string().trim().min(1),
  trackingNumber: z.string().trim().min(1),
});

ordersRouter.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: true, shippingAddress: true, user: true },
  });
  res.json(orders);
});

ordersRouter.post("/:id/dispatch", requireAuth, requireAdmin, async (req, res) => {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: {
      status: "SHIPPED",
      carrier: parsed.data.carrier,
      trackingNumber: parsed.data.trackingNumber,
    },
    include: { user: true },
  });

  await sendShippingNotificationEmail(
    order.user.email,
    order.id,
    parsed.data.carrier,
    parsed.data.trackingNumber
  );

  res.json(order);
});
