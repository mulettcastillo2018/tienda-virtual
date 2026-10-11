import type { OrderStatus, PaymentOption, ReturnRequest, ReturnStatus, ReturnType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { businessDeadline, RETURN_DEADLINE_BUSINESS_DAYS } from "../lib/businessDays";
import { lockOrder, releaseStock, transitionOrder } from "./orderLifecycle";
import { issueCreditNoteFor } from "./fiscal/fiscal.service";

// Causales de la reversión del pago (Ley 1480 de 2011, art. 51).
export const REVERSION_CAUSES = ["FRAUDE", "NO_SOLICITADA", "NO_RECIBIDO", "DEFECTUOSO"] as const;
export type ReversionCause = (typeof REVERSION_CAUSES)[number];

export class ReturnError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const PAID: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
const OPEN: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED"];

interface OrderForReturn {
  status: OrderStatus;
  paymentOption: PaymentOption;
  statusLogs: { toStatus: OrderStatus; changedAt: Date }[];
  returnRequests: { status: ReturnStatus }[];
}

type Option = { available: boolean; deadline: Date | null };

// Qué puede pedir el cliente de un pedido y hasta cuándo. Una sola solicitud
// vigente por pedido (una rechazada no impide pedir otra si sigue en plazo).
export function returnOptionsFor(order: OrderForReturn, now = new Date()): { RETRACTO: Option; REVERSION: Option } {
  const delivered = order.statusLogs.filter((log) => log.toStatus === "DELIVERED").at(-1)?.changedAt ?? null;
  const deadline = delivered ? businessDeadline(delivered, RETURN_DEADLINE_BUSINESS_DAYS) : null;
  const inProgress = order.returnRequests.some((request) => request.status !== "REJECTED");
  // Retracto: compras a distancia, dentro de los 5 días hábiles siguientes a la entrega.
  const retracto = !inProgress && order.status === "DELIVERED" && deadline !== null && now <= deadline;
  // Reversión: pagos electrónicos; si no se ha entregado (p. ej. no llegó), sigue abierta.
  const reversion =
    !inProgress && order.paymentOption === "ONLINE" && PAID.includes(order.status) && (deadline === null || now <= deadline);
  return { RETRACTO: { available: retracto, deadline }, REVERSION: { available: reversion, deadline } };
}

const orderForReturn = {
  statusLogs: { select: { toStatus: true, changedAt: true }, orderBy: { changedAt: "asc" as const } },
  returnRequests: { select: { status: true } },
};

export async function createReturnRequest(orderId: string, input: { type: ReturnType; cause?: string | null; note?: string | null }) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderForReturn });
  const option = returnOptionsFor(order)[input.type];
  if (!option.available) {
    throw new ReturnError(
      409,
      input.type === "RETRACTO"
        ? "El retracto se pide dentro de los 5 días hábiles siguientes a la entrega, y solo una vez por pedido."
        : "La reversión aplica a pagos en línea, dentro de los 5 días hábiles siguientes a la entrega, y solo una vez por pedido."
    );
  }
  if (input.type === "REVERSION" && !REVERSION_CAUSES.includes(input.cause as ReversionCause)) {
    throw new ReturnError(400, "Indica la causal de la reversión.");
  }
  return prisma.returnRequest.create({
    data: {
      orderId,
      type: input.type,
      cause: input.type === "REVERSION" ? input.cause : null,
      customerNote: input.note ?? null,
      // Sin entrega todavía (reversión por producto no recibido): desde hoy.
      deadlineAt: option.deadline ?? businessDeadline(new Date(), RETURN_DEADLINE_BUSINESS_DAYS),
    },
  });
}

// Cambia el estado solo si está en uno de los esperados (dos clics seguidos
// no aplican el paso dos veces).
async function move(id: string, from: ReturnStatus[], data: Partial<ReturnRequest>) {
  const moved = await prisma.returnRequest.updateMany({ where: { id, status: { in: from } }, data });
  if (moved.count === 0) {
    const exists = await prisma.returnRequest.findUnique({ where: { id }, select: { id: true } });
    throw new ReturnError(exists ? 409 : 404, exists ? "La solicitud ya no está en un estado que permita este paso." : "Solicitud no encontrada");
  }
  return prisma.returnRequest.findUniqueOrThrow({ where: { id } });
}

export const approveReturn = (id: string, note: string | null) => move(id, ["REQUESTED"], { status: "APPROVED", storeNote: note });

export const rejectReturn = (id: string, note: string) => move(id, ["REQUESTED", "APPROVED"], { status: "REJECTED", storeNote: note, resolvedAt: new Date() });

// El producto volvió a la tienda: se reintegra al inventario.
export async function receiveReturn(id: string) {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.returnRequest.updateMany({ where: { id, status: "APPROVED" }, data: { status: "RECEIVED" } });
    if (moved.count === 0) throw new ReturnError(409, "Solo se recibe una devolución aprobada.");
    const request = await tx.returnRequest.findUniqueOrThrow({ where: { id } });
    await releaseStock(tx, request.orderId);
    return request;
  });
}

// Se devolvió el dinero: el pedido queda reembolsado y la factura, anulada
// con una nota crédito.
export async function refundReturn(id: string, reference: string, changedById: string) {
  const request = await prisma.$transaction(async (tx) => {
    const current = await tx.returnRequest.findUnique({ where: { id } });
    if (!current) throw new ReturnError(404, "Solicitud no encontrada");
    if (current.status !== "APPROVED" && current.status !== "RECEIVED") throw new ReturnError(409, "Primero aprueba la solicitud.");
    const order = await lockOrder(tx, current.orderId);
    if (!order) throw new ReturnError(404, "Orden no encontrada");
    const label = current.type === "RETRACTO" ? "Retracto" : "Reversión del pago";
    if (!(await transitionOrder(tx, order.id, PAID, "REFUNDED", `${label}: reembolso ${reference}`, changedById))) {
      throw new ReturnError(409, "El pedido ya no está en un estado que se pueda reembolsar.");
    }
    // Lo que nunca salió de la bodega vuelve al inventario (lo devuelto ya volvió al recibirlo).
    if (current.status !== "RECEIVED" && (order.status === "PAID" || order.status === "PROCESSING")) await releaseStock(tx, order.id);
    return tx.returnRequest.update({ where: { id }, data: { status: "REFUNDED", refundReference: reference, resolvedAt: new Date() } });
  });
  await issueCreditNoteFor(request.orderId, request.type === "RETRACTO" ? "Retracto del consumidor" : "Reversión del pago");
  return request;
}

export function isOpen(status: ReturnStatus) {
  return OPEN.includes(status);
}
