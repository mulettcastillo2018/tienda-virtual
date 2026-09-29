import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { calculateShippingQuote } from "../services/carrier.service";
import { sendShippingNotificationEmail } from "../services/email.service";
import { catchAsync } from "../lib/catchAsync";
import { getEffectivePrice, isDiscountActive } from "../lib/pricing";
import { cancelPendingOrder, lockOrder, paymentDeadline, transitionOrder } from "../services/orderLifecycle";

export const ordersRouter = Router();

class InsufficientStockError extends Error {
  constructor(productName: string) {
    super(`Sin stock suficiente de "${productName}"`);
  }
}

const checkoutSchema = z.object({
  shippingAddressId: z.string().min(1),
});

ordersRouter.post(
  "/checkout",
  requireAuth,
  catchAsync(async (req, res) => {
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
      (sum, item) => sum + getEffectivePrice(item.product) * item.quantity,
      0
    );
    const totalAmount = subtotal + shippingQuote.cost;

    // Para poder explicar después "por qué" un producto se facturó más barato,
    // enlazamos cada línea al descuento vigente en ese momento (ProductDiscountLog),
    // no solo al precio ya calculado.
    const discountedProductIds = cart.items.filter((item) => isDiscountActive(item.product)).map((item) => item.productId);
    const now = new Date();
    const activeDiscountLogs = discountedProductIds.length
      ? await prisma.productDiscountLog.findMany({
          where: { productId: { in: discountedProductIds }, startedAt: { lte: now }, endsAt: { gte: now } },
        })
      : [];
    const discountLogByProductId = new Map(activeDiscountLogs.map((log) => [log.productId, log.id]));

    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
        // Reserva de inventario primero, con guarda atómica contra condiciones de
        // carrera: si dos compras concurrentes agotan el mismo producto, la
        // actualización solo tiene efecto mientras stock >= cantidad siga siendo
        // cierto en el momento exacto de escribir la fila (Postgres bloquea la fila
        // durante el UPDATE), así que la segunda petición ve count === 0 y falla
        // limpiamente en vez de dejar el stock en negativo.
        for (const item of cart.items) {
          const result = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (result.count === 0) {
            throw new InsufficientStockError(item.product.name);
          }
        }

        const created = await tx.order.create({
          data: {
            userId,
            shippingAddressId,
            totalAmount,
            shippingCost: shippingQuote.cost,
            carrier: shippingQuote.carrier,
            expiresAt: paymentDeadline(),
            statusLogs: { create: { toStatus: "PENDING", reason: "Pedido creado", changedById: userId } },
            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                priceAtPurchase: getEffectivePrice(item.product),
                discountLogId: discountLogByProductId.get(item.productId),
              })),
            },
          },
          include: { items: true },
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        return created;
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }

    res.status(201).json(order);
  })
);

// Lo que ve el cliente de su pedido: sin el correo de quien creó el
// descuento ni la respuesta completa de Wompi.
const customerOrderInclude = {
  items: { include: { product: true, discountLog: { select: { discountPercentage: true } } } },
  shippingAddress: true,
  payments: { orderBy: { createdAt: "desc" as const }, select: { status: true, paymentMethod: true, createdAt: true } },
};

ordersRouter.get(
  "/me",
  requireAuth,
  catchAsync(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: customerOrderInclude,
    });
    res.json(orders);
  })
);

ordersRouter.get(
  "/:id",
  requireAuth,
  catchAsync(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      include: customerOrderInclude,
    });
    if (!order) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    res.json(order);
  })
);

// El cliente cancela un pedido que todavía no pagó: el inventario se libera
// y los productos vuelven a su carrito.
ordersRouter.post(
  "/:id/cancel",
  requireAuth,
  catchAsync(async (req, res) => {
    const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: req.user!.userId }, select: { id: true, status: true } });
    if (!order) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    if (!(await cancelPendingOrder(order.id, "Cancelado por el cliente", req.user!.userId))) {
      res.status(409).json({ error: "Solo se puede cancelar un pedido que todavía no se ha pagado." });
      return;
    }
    res.json({ ok: true });
  })
);

// --- Administración de despachos ---

const dispatchSchema = z.object({
  carrier: z.string().trim().min(1),
  trackingNumber: z.string().trim().min(1),
});

ordersRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        shippingAddress: true,
        user: { select: { id: true, email: true, role: true } },
        payments: { orderBy: { createdAt: "desc" }, select: { status: true, paymentMethod: true, providerTransactionId: true, createdAt: true } },
      },
    });
    res.json(orders);
  })
);

ordersRouter.post(
  "/:id/dispatch",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = dispatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    // Solo se despacha lo que está pagado.
    const dispatched = await prisma.$transaction(async (tx) => {
      const current = await lockOrder(tx, req.params.id);
      if (!current) return null;
      const ok = await transitionOrder(
        tx,
        current.id,
        ["PAID", "PROCESSING"],
        "SHIPPED",
        `Despachado con ${parsed.data.carrier}, guía ${parsed.data.trackingNumber}`,
        req.user!.userId
      );
      if (!ok) return { status: current.status };
      await tx.order.update({ where: { id: current.id }, data: { carrier: parsed.data.carrier, trackingNumber: parsed.data.trackingNumber } });
      return { status: "SHIPPED" as const };
    });
    if (!dispatched) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    if (dispatched.status !== "SHIPPED") {
      res.status(409).json({ error: "Solo se pueden despachar pedidos pagados." });
      return;
    }
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { user: { select: { id: true, email: true, role: true } } },
    });

    await sendShippingNotificationEmail(
      order.user.email,
      order.id,
      parsed.data.carrier,
      parsed.data.trackingNumber
    );

    res.json(order);
  })
);

const reviewSchema = z.object({ note: z.string().trim().min(3).max(500) });

// El administrador deja constancia de cómo resolvió un pedido marcado para
// revisión (p. ej. "reembolsado en Wompi el 29/09") y quita la marca.
ordersRouter.post(
  "/:id/review-resolved",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Escribe cómo se resolvió (mínimo 3 caracteres)." });
      return;
    }
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, needsReview: true } });
    if (!order) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    if (!order.needsReview) {
      res.status(409).json({ error: "Este pedido no tiene nada pendiente de revisión." });
      return;
    }
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { needsReview: false } }),
      prisma.orderStatusLog.create({
        data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, reason: `Revisión resuelta: ${parsed.data.note}`, changedById: req.user!.userId },
      }),
    ]);
    res.json({ ok: true });
  })
);
