import crypto from "crypto";

export interface WompiSignatureInput {
  reference: string;
  amountInCents: number;
  currency: "COP";
}

// Una transacción tal como la informa Wompi (webhook o consulta a su API).
export interface WompiTransaction {
  id: string;
  reference: string;
  status: "PENDING" | "APPROVED" | "DECLINED" | "VOIDED" | "ERROR";
  amount_in_cents: number;
  currency?: string;
  payment_method_type?: string;
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

function sameHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Verifica la firma que Wompi envía en cada evento de webhook (signature.checksum),
// calculada sobre las propiedades indicadas en signature.properties. Un evento
// mal formado se trata como firma inválida.
export function verifyWebhookChecksum(event: {
  signature?: { properties?: unknown; checksum?: unknown };
  data?: Record<string, unknown>;
  timestamp?: unknown;
}): boolean {
  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) throw new Error("WOMPI_EVENTS_SECRET no configurado");

  const properties = event.signature?.properties;
  const checksum = event.signature?.checksum;
  if (!Array.isArray(properties) || typeof checksum !== "string" || !event.data || event.timestamp === undefined) return false;

  const values = properties.map((path) => {
    const value = String(path)
      .split(".")
      .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], event.data);
    return String(value);
  });

  const raw = `${values.join("")}${event.timestamp}${secret}`;
  const computed = crypto.createHash("sha256").update(raw).digest("hex");

  return sameHex(computed, checksum);
}

// API de Wompi del mismo ambiente que las llaves (pruebas o producción).
function apiBaseUrl(): string {
  if (process.env.WOMPI_API_URL) return process.env.WOMPI_API_URL.replace(/\/$/, "");
  return process.env.WOMPI_PUBLIC_KEY?.startsWith("pub_prod_") ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
}

export function canQueryWompi(): boolean {
  return Boolean(process.env.WOMPI_PRIVATE_KEY);
}

// Transacciones de una referencia, consultadas directamente a Wompi con la
// llave privada. Sirve cuando el webhook no llega (sin internet, o en
// desarrollo local, donde Wompi no puede llamar a localhost).
export async function fetchTransactionsByReference(reference: string): Promise<WompiTransaction[]> {
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  if (!privateKey) throw new Error("WOMPI_PRIVATE_KEY no configurado");
  const res = await fetch(`${apiBaseUrl()}/transactions?reference=${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Wompi respondió ${res.status} al consultar la referencia ${reference}`);
  const body = (await res.json()) as { data?: WompiTransaction[] };
  return Array.isArray(body.data) ? body.data : [];
}
