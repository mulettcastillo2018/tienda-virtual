import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

type Tx = Prisma.TransactionClient;

// Tiempo para pagar un pedido. Después se cancela solo, el inventario que
// tenía reservado vuelve a estar disponible y los productos regresan al
// carrito del cliente.
export const PAYMENT_WINDOW_MINUTES = Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES) || 60;

export function paymentDeadline(from = new Date()): Date {
  return new Date(from.getTime() + PAYMENT_WINDOW_MINUTES * 60_000);
}

// Bloquea la fila del pedido hasta el final de la transacción: el webhook, la
// sincronización con Wompi, el vencimiento y el cliente que cancela no pueden
// cambiarlo al mismo tiempo.
export async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  return tx.order.findUnique({ where: { id: orderId } });
}

// Cambia el estado solo si el pedido está en uno de los estados esperados, y
// deja constancia en la bitácora. Devuelve false si el pedido ya estaba en
// otro estado (otro proceso llegó primero).
export async function transitionOrder(
  tx: Tx,
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
  reason: string,
  changedById: string | null = null
): Promise<boolean> {
  const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!current || !from.includes(current.status)) return false;
  const updated = await tx.order.updateMany({ where: { id: orderId, status: current.status }, data: { status: to } });
  if (updated.count === 0) return false;
  await tx.orderStatusLog.create({ data: { orderId, fromStatus: current.status, toStatus: to, reason, changedById } });
  return true;
}

export async function releaseStock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
  }
}

// Vuelve a reservar el inventario de un pedido, todo o nada (se usa cuando
// llega tarde la aprobación de un pedido que ya se había cancelado). Bloquea
// los productos para que la revisión y el descuento sean una sola operación.
export async function tryReserveStock(tx: Tx, orderId: string): Promise<boolean> {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  if (items.length === 0) return true;
  const needed = new Map<string, number>();
  for (const item of items) needed.set(item.productId, (needed.get(item.productId) ?? 0) + item.quantity);
  const rows = await tx.$queryRaw<{ id: string; stock: number }[]>`
    SELECT id, stock FROM "Product" WHERE id IN (${Prisma.join([...needed.keys()])}) ORDER BY id FOR UPDATE`;
  const stockById = new Map(rows.map((r) => [r.id, r.stock]));
  for (const [productId, quantity] of needed) {
    if ((stockById.get(productId) ?? 0) < quantity) return false;
  }
  for (const [productId, quantity] of needed) {
    await tx.product.update({ where: { id: productId }, data: { stock: { decrement: quantity } } });
  }
  return true;
}

// Marca el pedido para que un administrador lo revise (p. ej. hay que
// reembolsar un pago), sin perder notas anteriores.
export async function flagForReview(tx: Tx, orderId: string, note: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { reviewNote: true } });
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const reviewNote = [order?.reviewNote, `[${stamp} UTC] ${note}`].filter(Boolean).join("\n");
  await tx.order.update({ where: { id: orderId }, data: { needsReview: true, reviewNote } });
}

// Devuelve los productos de un pedido cancelado al carrito del cliente
// (solo los que siguen a la venta), para que no tenga que armarlo de nuevo.
async function restoreCart(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { userId: true, items: { select: { productId: true, quantity: true, product: { select: { isActive: true } } } } },
  });
  if (!order) return;
  const cart = await tx.cart.upsert({ where: { userId: order.userId }, create: { userId: order.userId }, update: {} });
  for (const item of order.items) {
    if (!item.product.isActive) continue;
    await tx.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId: item.productId } },
      create: { cartId: cart.id, productId: item.productId, quantity: item.quantity },
      update: { quantity: { increment: item.quantity } },
    });
  }
}

// Cancela un pedido que todavía no se ha pagado: libera el inventario y
// devuelve los productos al carrito. false si ya no estaba pendiente.
export async function cancelPendingOrder(
  orderId: string,
  reason: string,
  changedById: string | null = null,
  { restoreToCart = true }: { restoreToCart?: boolean } = {}
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const cancelled = await transitionOrder(tx, orderId, ["PENDING"], "CANCELLED", reason, changedById);
    if (!cancelled) return false;
    await releaseStock(tx, orderId);
    if (restoreToCart) await restoreCart(tx, orderId);
    return true;
  });
}

// Pedidos pendientes cuyo plazo para pagar ya pasó (los creados antes de
// existir el plazo se miden desde su creación).
export async function findExpiredPendingOrders(now = new Date(), take = 50) {
  const legacyCutoff = new Date(now.getTime() - PAYMENT_WINDOW_MINUTES * 60_000);
  return prisma.order.findMany({
    where: {
      status: "PENDING",
      OR: [{ expiresAt: { lt: now } }, { expiresAt: null, createdAt: { lt: legacyCutoff } }],
    },
    select: { id: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take,
  });
}
