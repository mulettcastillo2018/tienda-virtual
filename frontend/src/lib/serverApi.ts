// Lecturas públicas de la API desde el servidor de Next (páginas renderizadas
// en el servidor, metadatos y sitemap). Nada de sesión aquí: solo catálogo.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Dirección pública de la tienda, para enlaces absolutos (canonical, Open Graph, sitemap). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");

export const STORE_NAME = "Tienda Virtual";

export type ServerResult<T> = { ok: true; data: T } | { ok: false; status: number | null };

/**
 * GET a la API con caché de `revalidate` segundos. Si la API no responde a
 * tiempo (la del plan gratis se duerme), devuelve `{ ok: false }` y la página
 * se arma en el navegador como antes, en vez de quedarse esperando.
 */
export async function serverGet<T>(path: string, revalidate = 60): Promise<ServerResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: null };
  }
}

/** JSON-LD seguro dentro de <script>: sin "<" que pueda cerrar la etiqueta. */
export function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

/** Texto plano corto para descripciones (sin saltos ni espacios dobles). */
export function summarize(text: string, max = 160) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
