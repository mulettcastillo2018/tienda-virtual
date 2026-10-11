import type { BadgeTone } from "@/components/ui/Badge";
import type { OrderStatus, PaymentOption, PqrsStatus } from "@/lib/types";

/** Color de la insignia de cada estado de pedido (cuenta y paneles). */
export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: "warning",
  PAID: "success",
  PROCESSING: "neutral",
  SHIPPED: "dark",
  DELIVERED: "success",
  CANCELLED: "neutral",
};

/** Clave del texto del estado: un pedido contra entrega pendiente no espera
 *  un pago en línea sino la confirmación con el cliente. */
export function orderStatusKey(order: { status: OrderStatus; paymentOption?: PaymentOption }) {
  return order.paymentOption === "CASH_ON_DELIVERY" && order.status === "PENDING" ? "orderStatus.COD_PENDING" : `orderStatus.${order.status}`;
}

/** Color de la insignia de cada estado de PQRS. */
export const PQRS_STATUS_TONE: Record<PqrsStatus, BadgeTone> = {
  RECIBIDO: "neutral",
  EN_PROCESO: "warning",
  RESUELTO: "success",
  CERRADO: "dark",
};
