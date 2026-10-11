import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { isValidOrderToken } from "../lib/orderAccess";
import { generateIntegritySignature, generateOrderReference, verifyWebhookChecksum, type WompiTransaction } from "../services/wompi.service";
import { applyWompiTransaction, syncOrderPayments } from "../services/payments.service";
import { cancelPendingOrder } from "../services/orderLifecycle";
import { catchAsync } from "../lib/catchAsync";

export const paymentsRouter = Router();

// Si la página de pago se abre dos veces seguidas (recarga, doble montaje),
// se reutiliza el intento recién creado en vez de abrir otro.
const REUSE_ATTEMPT_MS = 2 * 60_000;

function notPayableMessage(status: string, guest: boolean): string {
  if (status === "CANCELLED") return guest ? "Este pedido se canceló." : "Este pedido se canceló. Los productos volvieron a tu carrito.";
  return "Este pedido ya está pagado.";
}

// Quién puede ver o pagar un pedido: su dueño con sesión, o quien tenga el
// enlace firmado de un pedido hecho como invitado (cabecera X-Order-Token).
function orderAccess(req: Request, res: Response, next: NextFunction) {
  const token = req.get("x-order-token");
  if (token === undefined) return requireAuth(req, res, next);
  if (!isValidOrderToken(req.params.orderId, token)) {
    res.status(404).json({ error: "Orden no encontrada" });
    return;
  }
  next();
}

// Filtro del pedido según el acceso: el del usuario, o uno de invitado.
function ownOrder(req: Request) {
  if (!req.user) return { id: req.params.orderId, userId: null };
  return { id: req.params.orderId, ...(req.user.role === "ADMIN" ? {} : { userId: req.user.userId }) };
}

paymentsRouter.post(
  "/wompi/initiate/:orderId",
  orderAccess,
  catchAsync(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: req.user ? { id: req.params.orderId, userId: req.user.userId } : ownOrder(req),
    });
    if (!order) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    const guest = order.userId === null;
    if (order.paymentOption === "CASH_ON_DELIVERY") {
      res.status(409).json({ error: "Este pedido se paga en efectivo al recibirlo." });
      return;
    }
    if (order.status === "PENDING" && order.expiresAt && order.expiresAt < new Date()) {
      await cancelPendingOrder(order.id, "Venció el plazo para pagar");
      res.status(409).json({ error: guest ? "Venció el plazo para pagar este pedido." : "Venció el plazo para pagar este pedido. Los productos volvieron a tu carrito." });
      return;
    }
    if (order.status !== "PENDING") {
      res.status(409).json({ error: notPayableMessage(order.status, guest) });
      return;
    }

    const amountInCents = order.totalAmount * 100;
    const payment = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      const recent = await tx.payment.findFirst({
        where: { orderId: order.id, status: "PENDING", providerTransactionId: null, createdAt: { gte: new Date(Date.now() - REUSE_ATTEMPT_MS) } },
        orderBy: { createdAt: "desc" },
      });
      if (recent) return recent;
      return tx.payment.create({
        data: { orderId: order.id, status: "PENDING", paymentReference: generateOrderReference(order.id), amountInCents },
      });
    });

    res.json({
      reference: payment.paymentReference,
      amountInCents,
      currency: "COP",
      signature: generateIntegritySignature({ reference: payment.paymentReference, amountInCents, currency: "COP" }),
      publicKey: process.env.WOMPI_PUBLIC_KEY,
      expiresAt: order.expiresAt,
    });
  })
);

// Estado de un pedido para la página de resultado del pago: antes consulta a
// Wompi los intentos abiertos (por si el webhook no ha llegado).
paymentsRouter.post(
  "/wompi/sync/:orderId",
  orderAccess,
  catchAsync(async (req, res) => {
    const order = await prisma.order.findFirst({ where: ownOrder(req), select: { id: true, paymentOption: true } });
    if (!order) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }

    let pendingAtWompi = false;
    if (order.paymentOption === "ONLINE") {
      try {
        pendingAtWompi = (await syncOrderPayments(order.id)).pendingAtWompi;
      } catch (err) {
        console.error(`No se pudo consultar Wompi para el pedido ${order.id}:`, err);
      }
    }

    const current = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        shippingCost: true,
        expiresAt: true,
        needsReview: true,
        paymentOption: true,
        codFee: true,
        userId: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, paymentMethod: true, updatedAt: true } },
      },
    });
    const { payments, userId, ...rest } = current;
    res.json({ ...rest, guest: userId === null, lastPayment: payments[0] ?? null, pendingAtWompi });
  })
);

// Ruta pública — Wompi la invoca directamente. El body llega como Buffer crudo
// (ver app.use(express.raw(...)) en src/index.ts) para poder validar la firma
// exactamente sobre lo que Wompi envió. Todo lo que no sea un error del
// servidor responde 200: Wompi reintenta los demás códigos.
paymentsRouter.post(
  "/wompi/webhook",
  catchAsync(async (req, res) => {
    let event: { event?: string; data?: { transaction?: WompiTransaction }; signature?: { properties?: unknown; checksum?: unknown }; timestamp?: unknown };
    try {
      event = JSON.parse(req.body.toString("utf8"));
    } catch {
      res.status(400).json({ error: "Body inválido" });
      return;
    }

    if (!verifyWebhookChecksum(event as Parameters<typeof verifyWebhookChecksum>[0])) {
      res.status(401).json({ error: "Firma inválida" });
      return;
    }

    const transaction = event.data?.transaction;
    if (event.event !== "transaction.updated" || !transaction?.reference) {
      res.json({ received: true, ignored: true });
      return;
    }

    const result = await applyWompiTransaction(transaction, event);
    res.json({ received: true, result });
  })
);
