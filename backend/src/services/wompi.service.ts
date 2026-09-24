import crypto from "crypto";

export interface WompiSignatureInput {
  reference: string;
  amountInCents: number;
  currency: "COP";
}

// Firma de integridad de Wompi: SHA-256("<referencia><monto_en_centavos><moneda><secreto_integridad>")
// https://docs.wompi.co
export function generateIntegritySignature({
  reference,
  amountInCents,
  currency,
}: WompiSignatureInput): string {
  const secret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!secret) throw new Error("WOMPI_INTEGRITY_SECRET no configurado");

  const raw = `${reference}${amountInCents}${currency}${secret}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateOrderReference(orderId: string): string {
  return `ORDER-${orderId}-${Date.now()}`;
}

// Verifica la firma que Wompi envía en cada evento de webhook (signature.checksum),
// calculada sobre las propiedades indicadas en signature.properties.
export function verifyWebhookChecksum(event: {
  signature: { properties: string[]; checksum: string };
  data: Record<string, unknown>;
  timestamp: number;
}): boolean {
  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) throw new Error("WOMPI_EVENTS_SECRET no configurado");

  const values = event.signature.properties.map((path) => {
    const value = path
      .split(".")
      .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], event.data);
    return String(value);
  });

  const raw = `${values.join("")}${event.timestamp}${secret}`;
  const computed = crypto.createHash("sha256").update(raw).digest("hex");

  return computed === event.signature.checksum;
}
