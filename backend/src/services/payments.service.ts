import { prisma } from "../lib/prisma";
import { sendOrderConfirmationEmail } from "./email.service";
import {
  cancelPendingOrder,
  findExpiredPendingOrders,
  flagForReview,
  lockOrder,
  releaseStock,
  transitionOrder,
  tryReserveStock,
} from "./orderLifecycle";
import { canQueryWompi, fetchTransactionsByReference, type WompiTransaction } from "./wompi.service";

const METHOD_LABELS: Record<string, string> = {
  CARD: "tarjeta",
  PSE: "PSE",
  NEQUI: "Nequi",
  BANCOLOMBIA_TRANSFER: "Bancolombia",
  BANCOLOMBIA_COLLECT: "corresponsal Bancolombia",
};

export type ApplyResult = "unknown-reference" | "duplicate" | "applied";

const FINAL_STATUSES = ["APPROVED", "DECLINED", "VOIDED", "ERROR"];

// Aplica el estado de una transacción de Wompi a su intento de pago y al
// pedido. Es idempotente: Wompi reintenta los webhooks, la misma
// transacción puede llegar también por la sincronización, y los eventos
// pueden llegar en desorden. Reglas:
// - El monto y la moneda deben coincidir con el pedido; si no, el pedido no
//   se da por pagado y queda para revisión.
// - APPROVED paga un pedido PENDING. Si el pedido ya se había cancelado (se
//   venció mientras el banco confirmaba), se vuelve a reservar el inventario;
//   si ya no alcanza, queda para reembolso. Un segundo pago aprobado del
//   mismo pedido también queda para reembolso.
// - DECLINED y ERROR solo marcan el intento: el pedido sigue pendiente y el
//   cliente puede pagar de nuevo hasta que venza el plazo.
// - VOIDED (pago anulado) cancela un pedido pagado que aún no se despacha.
export async function applyWompiTransaction(trx: WompiTransaction, raw?: unknown): Promise<ApplyResult> {
  const payment = await prisma.payment.findUnique({ where: { paymentReference: trx.reference } });
  if (!payment) return "unknown-reference";

  const outcome = await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, payment.orderId);
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (!order) return { result: "duplicate" as const, paid: false };
    if (current.providerTransactionId === trx.id) {
      if (current.status === trx.status) return { result: "duplicate" as const, paid: false };
      // Un estado final no cambia, salvo la anulación de un pago aprobado:
      // así un evento viejo que llega tarde (p. ej. PENDING) no deshace nada.
      const final = FINAL_STATUSES.includes(current.status);
      if (final && !(current.status === "APPROVED" && trx.status === "VOIDED")) return { result: "duplicate" as const, paid: false };
    }

    await tx.payment.update({
      where: { id: current.id },
      data: {
        status: trx.status,
        providerTransactionId: trx.id,
        paymentMethod: trx.payment_method_type ?? current.paymentMethod,
        amountInCents: trx.amount_in_cents,
        rawResponse: (raw ?? trx) as object,
      },
    });

    const expected = order.totalAmount * 100;
    if (trx.status === "APPROVED" && (trx.amount_in_cents !== expected || (trx.currency ?? "COP") !== "COP")) {
      await flagForReview(tx, order.id, `Pago ${trx.id} aprobado por ${trx.amount_in_cents / 100} ${trx.currency}, pero el pedido es de ${order.totalAmount} COP: no se dio por pagado.`);
      return { result: "applied" as const, paid: false };
    }

    const method = METHOD_LABELS[trx.payment_method_type ?? ""] ?? trx.payment_method_type ?? "Wompi";
    let paid = false;

    if (trx.status === "APPROVED") {
      if (order.status === "PENDING") {
        paid = await transitionOrder(tx, order.id, ["PENDING"], "PAID", `Pago aprobado por ${method} (transacción ${trx.id})`);
      } else if (order.status === "CANCELLED") {
        if (await tryReserveStock(tx, order.id)) {
          paid = await transitionOrder(tx, order.id, ["CANCELLED"], "PAID", `Pago aprobado después de cancelado (transacción ${trx.id}); se volvió a reservar el inventario`);
        } else {
          await flagForReview(tx, order.id, `Pago ${trx.id} aprobado sobre un pedido cancelado y ya no hay inventario: hay que reembolsarlo.`);
        }
      } else {
        const otherApproved = await tx.payment.count({ where: { orderId: order.id, status: "APPROVED", id: { not: current.id } } });
        if (otherApproved > 0) {
          await flagForReview(tx, order.id, `Pago duplicado: la transacción ${trx.id} se aprobó sobre un pedido ya pagado. Hay que reembolsarla.`);
        }
      }
    } else if (trx.status === "VOIDED" && current.status === "APPROVED") {
      if (order.status === "PAID") {
        if (await transitionOrder(tx, order.id, ["PAID"], "CANCELLED", `Pago anulado en Wompi (transacción ${trx.id})`)) {
          await releaseStock(tx, order.id);
        }
      } else if (order.status !== "CANCELLED") {
        await flagForReview(tx, order.id, `El pago ${trx.id} se anuló cuando el pedido ya estaba ${order.status}.`);
      }
    }
    return { result: "applied" as const, paid };
  });

  if (outcome.paid) await sendConfirmation(payment.orderId, trx);
  return outcome.result;
}

// El correo no puede tumbar el pago: si falla, queda en el registro y el
// pedido sigue pagado.
async function sendConfirmation(orderId: string, trx: WompiTransaction) {
  try {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { product: true } }, shippingAddress: true, user: true },
    });
    await sendOrderConfirmationEmail(
      order.user.email,
      {
        id: order.id,
        totalAmount: order.totalAmount,
        shippingCost: order.shippingCost,
        items: order.items.map((item) => ({ productName: item.product.name, quantity: item.quantity, priceAtPurchase: item.priceAtPurchase })),
        shippingAddress: order.shippingAddress,
      },
      { providerTransactionId: trx.id, paymentMethod: trx.payment_method_type ?? null }
    );
  } catch (err) {
    console.error(`No se pudo enviar la confirmación del pedido ${orderId}:`, err);
  }
}

// Consulta a Wompi los intentos de pago que siguen abiertos y aplica lo que
// encuentre. `pendingAtWompi`: hay una transacción en trámite (p. ej. PSE
// esperando al banco).
export async function syncOrderPayments(orderId: string): Promise<{ checked: boolean; pendingAtWompi: boolean }> {
  if (!canQueryWompi()) return { checked: false, pendingAtWompi: false };
  const open = await prisma.payment.findMany({ where: { orderId, status: "PENDING" }, select: { paymentReference: true } });
  let pendingAtWompi = false;
  for (const { paymentReference } of open) {
    const transactions = await fetchTransactionsByReference(paymentReference);
    for (const trx of transactions) {
      if (trx.status === "PENDING") pendingAtWompi = true;
      await applyWompiTransaction(trx);
    }
  }
  return { checked: true, pendingAtWompi };
}

// Un pago en trámite se espera hasta este tiempo después del plazo antes de
// cancelar el pedido de todas formas (si luego se aprueba, se reactiva).
const GRACE_FOR_PENDING_MS = 24 * 60 * 60_000;

export async function expirePendingOrders(now = new Date()): Promise<number> {
  let cancelled = 0;
  for (const order of await findExpiredPendingOrders(now)) {
    let pendingAtWompi = false;
    try {
      pendingAtWompi = (await syncOrderPayments(order.id)).pendingAtWompi;
    } catch (err) {
      // Sin respuesta de Wompi se cancela igual: un pago que llegue después
      // reactiva el pedido o queda para reembolso.
      console.error(`No se pudo consultar Wompi para el pedido ${order.id}:`, err);
    }
    const deadline = (order.expiresAt ?? order.createdAt).getTime();
    if (pendingAtWompi && now.getTime() < deadline + GRACE_FOR_PENDING_MS) continue;
    // Los pedidos de antes de existir el plazo llevan días abandonados: se
    // cancelan sin llenar de nuevo el carrito de nadie.
    if (await cancelPendingOrder(order.id, "Venció el plazo para pagar", null, { restoreToCart: order.expiresAt !== null })) cancelled++;
  }
  return cancelled;
}

const EXPIRY_INTERVAL_MS = 5 * 60_000;

export function startOrderExpiryJob() {
  const run = () =>
    expirePendingOrders()
      .then((n) => n > 0 && console.log(`Pedidos vencidos sin pagar: ${n} cancelado(s), inventario liberado.`))
      .catch((err) => console.error("Error venciendo pedidos:", err));
  setTimeout(run, 10_000);
  setInterval(run, EXPIRY_INTERVAL_MS);
}
