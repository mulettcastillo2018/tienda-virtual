import { Router, type Request, type Response } from "express";
import type { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getRequestUser, requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { sendOrderReceivedEmail, sendShippingNotificationEmail } from "../services/email.service";
import { catchAsync } from "../lib/catchAsync";
import { clientIp, createRateLimiter, limitRequests } from "../lib/rateLimit";
import { guestOrderUrl, isValidOrderToken, orderAccessToken } from "../lib/orderAccess";
import { pageArgs, pageQuery } from "../lib/pagination";
import { withPublicImages } from "../services/storage";
import { cancelPendingOrder, lockOrder, releaseStock, transitionOrder } from "../services/orderLifecycle";
import { CheckoutError, MAX_PER_PRODUCT, placeOrder, quoteOrder, resolveLines, type BillingInfo, type CheckoutLine } from "../services/checkout.service";
import { parseNit } from "../lib/tax";
import { recordConsent } from "../lib/privacy";
import { scheduleFiscalProcessing } from "../services/fiscal/fiscal.service";
import { returnOptionsFor } from "../services/returns.service";

export const ordersRouter = Router();

const paymentOptionSchema = z.enum(["ONLINE", "CASH_ON_DELIVERY"]).default("ONLINE");

const addressSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(1).max(12),
  phone: z.string().trim().min(7).max(20),
});

// Factura a nombre de alguien (opcional). Con NIT, el dígito de verificación
// tiene que ser correcto; se guarda el número sin él.
const billingSchema = z
  .object({
    idType: z.enum(["13", "31", "22", "41"]),
    idNumber: z.string().trim().min(3).max(20),
    name: z.string().trim().min(2).max(150),
  })
  .transform((billing, ctx): BillingInfo => {
    if (billing.idType === "31") {
      const nit = parseNit(billing.idNumber);
      if (!nit) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idNumber"], message: "NIT inválido: escríbelo con el dígito de verificación." });
        return z.NEVER;
      }
      return { ...billing, idNumber: nit.number };
    }
    if (!/^[0-9A-Za-z]+$/.test(billing.idNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idNumber"], message: "El documento solo lleva números y letras." });
      return z.NEVER;
    }
    return billing;
  })
  .nullish();

const linesSchema = z
  .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(MAX_PER_PRODUCT) }))
  .min(1)
  .max(50);

// Un CheckoutError se responde con su código y mensaje; cualquier otro error sigue al manejador global.
function respondCheckoutError(res: Response, err: unknown) {
  if (!(err instanceof CheckoutError)) throw err;
  res.status(err.status).json({ error: err.message });
}

async function cartLines(userId: string): Promise<{ cartId: string | null; lines: CheckoutLine[] }> {
  const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: { select: { productId: true, quantity: true } } } });
  return { cartId: cart?.id ?? null, lines: cart?.items ?? [] };
}

// Cuánto cuesta el pedido antes de confirmarlo: envío según la dirección y si
// se puede pagar contra entrega. Con sesión usa el carrito y las direcciones
// guardadas; sin sesión (invitado) recibe los productos y la dirección.
const quoteSchema = z.object({
  shippingAddressId: z.string().min(1).optional(),
  address: addressSchema.pick({ city: true, postalCode: true }).optional(),
  items: linesSchema.optional(),
});

ordersRouter.post(
  "/quote",
  catchAsync(async (req, res) => {
    const parsed = quoteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { shippingAddressId, items } = parsed.data;
    const user = await getRequestUser(req);
    let address = parsed.data.address;
    if (shippingAddressId) {
      if (!user) {
        res.status(401).json({ error: "No autenticado" });
        return;
      }
      const saved = await prisma.shippingAddress.findFirst({ where: { id: shippingAddressId, userId: user.userId } });
      if (!saved) {
        res.status(404).json({ error: "Dirección de envío no encontrada" });
        return;
      }
      address = saved;
    }
    const lines = items ?? (user ? (await cartLines(user.userId)).lines : null);
    if (!address || !lines) {
      res.status(400).json({ error: "Faltan la dirección o los productos." });
      return;
    }
    try {
      res.json(await quoteOrder(await resolveLines(lines), address));
    } catch (err) {
      respondCheckoutError(res, err);
    }
  })
);

const checkoutSchema = z.object({
  shippingAddressId: z.string().min(1),
  paymentOption: paymentOptionSchema,
  billing: billingSchema,
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
    const { shippingAddressId, paymentOption, billing } = parsed.data;
    const address = await prisma.shippingAddress.findFirst({ where: { id: shippingAddressId, userId } });
    if (!address) {
      res.status(404).json({ error: "Dirección de envío no encontrada" });
      return;
    }
    const { cartId, lines } = await cartLines(userId);
    try {
      const resolved = await resolveLines(lines);
      const quote = await quoteOrder(resolved, address);
      const order = await placeOrder({ lines: resolved, quote, paymentOption, address, userId, guestEmail: null, shippingAddressId, cartId, billing });
      if (paymentOption === "CASH_ON_DELIVERY") {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (user) await notifyOrderReceived(order.id, user.email, null);
      }
      res.status(201).json(order);
    } catch (err) {
      respondCheckoutError(res, err);
    }
  })
);

// Compra sin cuenta: correo, dirección y productos en una sola petición. El
// pedido se consulta después con el enlace firmado que se devuelve (y que se
// envía al correo).
const guestCheckoutSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  address: addressSchema,
  items: linesSchema,
  paymentOption: paymentOptionSchema,
  billing: billingSchema,
  // Autorización de tratamiento de datos para gestionar el pedido (Ley 1581).
  acceptPrivacy: z.boolean().optional(),
});

const guestCheckoutsByIp = createRateLimiter(Number(process.env.GUEST_CHECKOUTS_PER_HOUR) || 20, 60 * 60_000);

ordersRouter.post(
  "/guest-checkout",
  limitRequests(guestCheckoutsByIp, clientIp, "Demasiados pedidos desde esta conexión. Intenta de nuevo más tarde."),
  catchAsync(async (req, res) => {
    const parsed = guestCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { email, address, items, paymentOption, billing, acceptPrivacy } = parsed.data;
    if (acceptPrivacy !== true) {
      res.status(400).json({ error: "Para comprar debes autorizar el tratamiento de tus datos personales." });
      return;
    }
    try {
      const resolved = await resolveLines(items);
      const quote = await quoteOrder(resolved, address);
      const order = await placeOrder({ lines: resolved, quote, paymentOption, address, userId: null, guestEmail: email, shippingAddressId: null, cartId: null, billing });
      await recordConsent(prisma, { orderId: order.id, email, purpose: "DATA_PROCESSING", granted: true, channel: "CHECKOUT_INVITADO", ipAddress: clientIp(req) });
      const accessToken = orderAccessToken(order.id);
      await notifyOrderReceived(order.id, email, guestOrderUrl(order.id));
      res.status(201).json({ ...order, accessToken });
    } catch (err) {
      respondCheckoutError(res, err);
    }
  })
);

// Correo de "recibimos tu pedido" (contra entrega, o invitado con su enlace).
// Un correo que falla no deshace el pedido.
async function notifyOrderReceived(orderId: string, email: string, trackingUrl: string | null) {
  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { product: { select: { name: true } } } } } });
    await sendOrderReceivedEmail(email, {
      id: order.id,
      totalAmount: order.totalAmount,
      shippingCost: order.shippingCost,
      codFee: order.codFee,
      cashOnDelivery: order.paymentOption === "CASH_ON_DELIVERY",
      items: order.items.map((item) => ({ productName: item.product.name, quantity: item.quantity, priceAtPurchase: item.priceAtPurchase })),
      shippingAddress: shippingAddressOf(order),
      trackingUrl,
    });
  } catch (err) {
    console.error(`No se pudo enviar el aviso del pedido ${orderId}:`, err);
  }
}

type SnapshotFields = {
  shippingFullName: string | null;
  shippingLine1: string | null;
  shippingLine2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingPostalCode: string | null;
  shippingCountry: string | null;
  shippingPhone: string | null;
};

// La dirección del pedido con la forma de siempre (la que espera el frontend).
function shippingAddressOf(order: SnapshotFields) {
  return {
    fullName: order.shippingFullName ?? "",
    addressLine1: order.shippingLine1 ?? "",
    addressLine2: order.shippingLine2,
    city: order.shippingCity ?? "",
    state: order.shippingState ?? "",
    postalCode: order.shippingPostalCode ?? "",
    country: order.shippingCountry ?? "CO",
    phone: order.shippingPhone ?? "",
  };
}

// Lo que ve el cliente de su pedido: sin el correo de quien creó el
// descuento ni la respuesta completa de Wompi.
const customerOrderInclude = {
  items: { include: { product: true, discountLog: { select: { discountPercentage: true } } } },
  payments: { orderBy: { createdAt: "desc" as const }, select: { status: true, paymentMethod: true, createdAt: true } },
  statusLogs: { orderBy: { changedAt: "asc" as const }, select: { fromStatus: true, toStatus: true, changedAt: true } },
  returnRequests: {
    orderBy: { createdAt: "desc" as const },
    select: { id: true, type: true, status: true, cause: true, storeNote: true, deadlineAt: true, createdAt: true, refundReference: true },
  },
  fiscalDocuments: {
    orderBy: { createdAt: "asc" as const },
    select: { type: true, prefix: true, number: true, status: true, uniqueCode: true, createdAt: true },
  },
} satisfies Prisma.OrderInclude;

function withProductImages<T extends { items: { product: { images: string[] } }[] }>(order: T): T {
  return { ...order, items: order.items.map((item) => ({ ...item, product: withPublicImages(item.product) })) };
}

// El cliente ve cuándo cambió de estado su pedido, no las notas internas
// (motivos, revisiones de pago, quién lo cambió).
function toCustomerOrder(order: Prisma.OrderGetPayload<{ include: typeof customerOrderInclude }>) {
  const { statusLogs, fiscalDocuments, ...rest } = withProductImages(order);
  const options = returnOptionsFor(order);
  return {
    ...rest,
    shippingAddress: shippingAddressOf(order),
    timeline: statusLogs.filter((log) => log.fromStatus !== log.toStatus).map((log) => ({ status: log.toStatus, at: log.changedAt })),
    // Qué puede pedir (retracto / reversión) y hasta cuándo.
    returnOptions: {
      RETRACTO: { available: options.RETRACTO.available, deadline: options.RETRACTO.deadline },
      REVERSION: { available: options.REVERSION.available, deadline: options.REVERSION.deadline },
    },
    // Solo los documentos aceptados por la DIAN (los demás van en trámite).
    invoices: fiscalDocuments.filter((doc) => doc.status === "ACCEPTED").map((doc) => ({ ...doc, fullNumber: `${doc.prefix}${doc.number}` })),
  };
}

ordersRouter.get(
  "/me",
  requireAuth,
  catchAsync(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: customerOrderInclude,
    });
    res.json(orders.map(toCustomerOrder));
  })
);

// Pedido de invitado: el token del enlace firmado va en la cabecera X-Order-Token.
async function findGuestOrder(req: Request, res: Response) {
  if (!isValidOrderToken(req.params.id, req.get("x-order-token"))) {
    res.status(404).json({ error: "Orden no encontrada" });
    return null;
  }
  const order = await prisma.order.findFirst({ where: { id: req.params.id, userId: null }, include: customerOrderInclude });
  if (!order) res.status(404).json({ error: "Orden no encontrada" });
  return order;
}

ordersRouter.get(
  "/guest/:id",
  catchAsync(async (req, res) => {
    const order = await findGuestOrder(req, res);
    if (order) res.json({ ...toCustomerOrder(order), guestEmail: order.guestEmail });
  })
);

ordersRouter.post(
  "/guest/:id/cancel",
  catchAsync(async (req, res) => {
    const order = await findGuestOrder(req, res);
    if (!order) return;
    if (!(await cancelPendingOrder(order.id, "Cancelado por el cliente (invitado)", null, { restoreToCart: false }))) {
      res.status(409).json({ error: "Solo se puede cancelar un pedido que todavía no se ha pagado ni confirmado." });
      return;
    }
    res.json({ ok: true });
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
    res.json(toCustomerOrder(order));
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

const STATUSES = ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const satisfies readonly OrderStatus[];

const adminListSchema = z.object({
  ...pageQuery,
  // Un estado; REVIEW: los marcados para que un administrador los revise;
  // TO_CONFIRM: contra entrega pendientes de confirmar con el cliente.
  status: z.enum([...STATUSES, "REVIEW", "TO_CONFIRM"]).optional(),
  q: z.string().trim().max(100).optional(),
});

// Pedidos para el panel: por estado, buscados por número, correo o nombre de
// quien recibe, de a una página. Incluye los conteos para las pestañas.
ordersRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = adminListSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize, status } = parsed.data;
    // El cliente ve su pedido como "#" y los últimos 8 caracteres del número.
    const q = parsed.data.q?.replace(/^#/, "");
    const where: Prisma.OrderWhereInput = {
      ...(status === "REVIEW"
        ? { needsReview: true }
        : status === "TO_CONFIRM"
          ? { status: "PENDING", paymentOption: "CASH_ON_DELIVERY" }
          : status
            ? { status }
            : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: "insensitive" } },
              { user: { email: { contains: q, mode: "insensitive" } } },
              { guestEmail: { contains: q, mode: "insensitive" } },
              { shippingFullName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [orders, total, byStatus, needsReview, toConfirm] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageArgs({ page, pageSize }),
        include: {
          items: { select: { id: true, productId: true, quantity: true, priceAtPurchase: true, discountLogId: true } },
          user: { select: { id: true, email: true, role: true } },
          payments: { orderBy: { createdAt: "desc" }, select: { status: true, paymentMethod: true, providerTransactionId: true, createdAt: true } },
          statusLogs: {
            orderBy: { changedAt: "asc" },
            select: { fromStatus: true, toStatus: true, reason: true, changedAt: true, changedBy: { select: { email: true } } },
          },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.order.count({ where: { needsReview: true } }),
      prisma.order.count({ where: { status: "PENDING", paymentOption: "CASH_ON_DELIVERY" } }),
    ]);
    const counts: Record<string, number> = { ALL: 0, REVIEW: needsReview, TO_CONFIRM: toConfirm };
    for (const row of byStatus) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }
    res.json({ items: orders.map((order) => ({ ...order, shippingAddress: shippingAddressOf(order) })), total, page, pageSize, counts });
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

    // Al cliente con cuenta, a su correo; al invitado, con el enlace de su pedido.
    const email = order.user?.email ?? order.guestEmail;
    if (email) {
      await sendShippingNotificationEmail(email, order.id, parsed.data.carrier, parsed.data.trackingNumber, order.user ? null : guestOrderUrl(order.id));
    }

    res.json(order);
  })
);

// Pasos del pedido que marca la administración (el despacho tiene su propia
// ruta porque registra transportadora y guía). Un pedido contra entrega no
// pasa por "pagado": se confirma con el cliente y se cobra al entregarlo.
type AdminStep = { from: readonly OrderStatus[]; to: OrderStatus; reason: string; error: string; cashOnDeliveryOnly?: boolean };

const ADMIN_STEPS = {
  confirm: {
    from: ["PENDING"],
    to: "PROCESSING",
    reason: "Confirmado con el cliente (contra entrega)",
    error: "Solo se confirma un pedido contra entrega que esté pendiente.",
    cashOnDeliveryOnly: true,
  },
  process: { from: ["PAID"], to: "PROCESSING", reason: "En preparación", error: "Solo se puede preparar un pedido pagado." },
  deliver: { from: ["SHIPPED"], to: "DELIVERED", reason: "Entregado al cliente", error: "Solo se puede marcar como entregado un pedido enviado." },
} as const satisfies Record<string, AdminStep>;

const stepSchema = z.object({ note: z.string().trim().max(200).optional() });

for (const [path, step] of Object.entries(ADMIN_STEPS)) {
  ordersRouter.post(
    `/:id/${path}`,
    requireAuth,
    requireAdmin,
    catchAsync(async (req, res) => {
      const parsed = stepSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: "La nota no puede pasar de 200 caracteres." });
        return;
      }
      const reason = parsed.data.note ? `${step.reason}: ${parsed.data.note}` : step.reason;
      const result = await prisma.$transaction(async (tx) => {
        const current = await lockOrder(tx, req.params.id);
        if (!current) return null;
        const cod = current.paymentOption === "CASH_ON_DELIVERY";
        if ((step as AdminStep).cashOnDeliveryOnly && !cod) return false;
        if (!(await transitionOrder(tx, current.id, [...step.from], step.to, reason, req.user!.userId))) return false;
        // Entregado contra entrega = cobrado: queda el pago en efectivo registrado.
        if (cod && step.to === "DELIVERED") {
          await tx.payment.create({
            data: {
              orderId: current.id,
              provider: "CASH",
              paymentMethod: "CASH",
              status: "APPROVED",
              amountInCents: current.totalAmount * 100,
              paymentReference: `CASH-${current.id}`,
            },
          });
        }
        return true;
      });
      if (result === null) {
        res.status(404).json({ error: "Orden no encontrada" });
        return;
      }
      if (!result) {
        res.status(409).json({ error: step.error });
        return;
      }
      // Contra entrega entregado = venta cobrada: va a facturación electrónica.
      if (step.to === "DELIVERED") scheduleFiscalProcessing();
      res.json({ ok: true, status: step.to });
    })
  );
}

// Contra entrega que no se concretó: el cliente no confirmó, no recibió o no
// pagó al entregar. Se cancela y el inventario vuelve (el producto regresa a
// la bodega con la transportadora).
const codFailedSchema = z.object({ note: z.string().trim().min(3).max(200) });

ordersRouter.post(
  "/:id/cod-failed",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = codFailedSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Escribe qué pasó (entre 3 y 200 caracteres)." });
      return;
    }
    const result = await prisma.$transaction(async (tx) => {
      const current = await lockOrder(tx, req.params.id);
      if (!current) return null;
      if (current.paymentOption !== "CASH_ON_DELIVERY") return false;
      const reason = `Contra entrega no concretado: ${parsed.data.note}`;
      if (!(await transitionOrder(tx, current.id, ["PENDING", "PROCESSING", "SHIPPED"], "CANCELLED", reason, req.user!.userId))) return false;
      await releaseStock(tx, current.id);
      return true;
    });
    if (result === null) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    if (!result) {
      res.status(409).json({ error: "Solo aplica a pedidos contra entrega que no se hayan entregado ni cancelado." });
      return;
    }
    res.json({ ok: true, status: "CANCELLED" });
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
