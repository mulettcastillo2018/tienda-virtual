import type { BadgeTone } from "@/components/ui/Badge";
import type { OrderStatus, PqrsStatus } from "@/lib/types";

/** Color de la insignia de cada estado de pedido (cuenta y paneles). */
export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: "warning",
  PAID: "success",
  PROCESSING: "neutral",
  SHIPPED: "dark",
  DELIVERED: "success",
  CANCELLED: "neutral",
};

/** Color de la insignia de cada estado de PQRS. */
export const PQRS_STATUS_TONE: Record<PqrsStatus, BadgeTone> = {
  RECIBIDO: "neutral",
  EN_PROCESO: "warning",
  RESUELTO: "success",
  CERRADO: "dark",
};
