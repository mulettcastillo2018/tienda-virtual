// Medios de pago que informa Wompi (payment_method_type) y el efectivo del
// contra entrega: el panel los muestra por su nombre, no por el código.
const KNOWN = ["CARD", "NEQUI", "PSE", "BANCOLOMBIA_TRANSFER", "BANCOLOMBIA_QR", "BANCOLOMBIA_COLLECT", "DAVIPLATA", "CASH"];

export function paymentMethodLabel(method: string | null | undefined, t: (key: string) => string): string {
  if (!method) return "—";
  return KNOWN.includes(method) ? t(`paymentMethods.${method}`) : method;
}
