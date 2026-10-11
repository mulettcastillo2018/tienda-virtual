// Cliente de la API de Alanube / Alegra e-provider para Colombia (tomado del
// módulo de comidas-rapidas). Documentación: https://developer.alanube.co/v1.0-COL
import type { FiscalDocumentType } from "@prisma/client";

export const SANDBOX_URL = "https://sandbox-api.alegra.com/e-provider/col/v1";
export const PRODUCTION_URL = "https://api.alegra.com/e-provider/col/v1";

const TIMEOUT_MS = 25_000;

const PATHS: Record<FiscalDocumentType, string> = {
  INVOICE: "/invoices",
  CREDIT_NOTE: "/credit-notes",
};

// Solo Alegra (sandbox o producción), o una dirección local para las pruebas
// automáticas; nunca un servidor cualquiera (el token viaja en la cabecera).
export function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && (u.hostname === "sandbox-api.alegra.com" || u.hostname === "api.alegra.com")) return true;
    return process.env.NODE_ENV !== "production" && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

export interface Connection {
  url: string;
  token: string;
}

export class AlanubeConnectionError extends Error {}

export interface AlanubeResponse {
  status: number;
  data: unknown;
}

async function call(connection: Connection, method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<AlanubeResponse> {
  if (!isAllowedUrl(connection.url)) throw new AlanubeConnectionError("La dirección de Alanube configurada no es válida");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(connection.url.replace(/\/$/, "") + path, {
      method,
      headers: {
        Authorization: `Bearer ${connection.token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Respuesta que no es JSON (p. ej. una página de error del proxy).
    }
    return { status: res.status, data };
  } catch (err) {
    throw new AlanubeConnectionError(err instanceof Error && err.name === "AbortError" ? "Alanube no respondió a tiempo" : "No hubo conexión con Alanube");
  } finally {
    clearTimeout(timer);
  }
}

export const issue = (c: Connection, type: FiscalDocumentType, body: unknown, idempotencyKey: string) => call(c, "POST", PATHS[type], body, idempotencyKey);
export const fetchStatus = (c: Connection, type: FiscalDocumentType, id: string) => call(c, "GET", `${PATHS[type]}/${encodeURIComponent(id)}`);

// Estado de un documento en la respuesta de Alanube. Viene envuelto según el
// tipo ("invoice", "credit-note"...): se busca el objeto que traiga el estado.
export interface AlanubeStatus {
  id: string | null;
  status: string | null;
  legalStatus: string | null;
  uniqueCode: string | null;
  qr: string | null;
  message: string | null;
  errors: string[];
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function readStatus(data: unknown): AlanubeStatus {
  const root = asObject(data) ?? {};
  const doc =
    [root.invoice, root.creditNote, root["credit-note"], root.document].map(asObject).find((o) => o && ("status" in o || "legalStatus" in o || "id" in o)) ?? root;
  const text = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const government = asObject(doc.governmentResponse);
  const messageOf = (e: unknown) => (asObject(e)?.message ? String(asObject(e)!.message) : String(e));
  const errors = [
    ...(Array.isArray(government?.errorMessages) ? (government!.errorMessages as unknown[]).map(String) : []),
    ...(Array.isArray(doc.errors) ? (doc.errors as unknown[]).map(messageOf) : []),
    ...(Array.isArray(root.errors) && root !== doc ? (root.errors as unknown[]).map(messageOf) : []),
  ];
  return {
    id: text(doc.id),
    status: text(doc.status),
    legalStatus: text(doc.legalStatus),
    uniqueCode: text(doc.cufe) ?? text(doc.cude),
    qr: text(doc.qrCodeContent),
    message: text(government?.message) ?? text(root.message) ?? text(doc.message),
    errors,
  };
}
