import { prisma } from "../lib/prisma";

export interface CodSettings {
  codEnabled: boolean;
  codCities: string[];
  codMaxAmount: number;
  codFee: number;
}

// Sin fila de configuración, el pago contra entrega queda apagado.
const DEFAULTS: CodSettings = { codEnabled: false, codCities: [], codMaxAmount: 500000, codFee: 0 };

export async function getStoreSettings(): Promise<CodSettings> {
  const row = await prisma.storeSettings.findUnique({ where: { id: "main" } });
  return row ? { codEnabled: row.codEnabled, codCities: row.codCities, codMaxAmount: row.codMaxAmount, codFee: row.codFee } : DEFAULTS;
}

// "Bogotá D.C." → "bogota d c": sin tildes, mayúsculas ni puntuación.
export function normalizeCity(city: string) {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// La ciudad de la dirección coincide con una de la lista si es la misma o
// empieza por ella ("Bogotá D.C." cuenta como "Bogotá").
export function cityAllowed(city: string, cities: string[]) {
  const target = normalizeCity(city);
  return cities.some((allowed) => {
    const name = normalizeCity(allowed);
    return name !== "" && (target === name || target.startsWith(`${name} `));
  });
}

export type CodUnavailableReason = "DISABLED" | "CITY" | "AMOUNT";

// Si el pedido puede pagarse contra entrega y, si no, por qué. `total` es el
// valor del pedido con envío, sin el recargo.
export function cashOnDelivery(settings: CodSettings, city: string, total: number) {
  const fee = settings.codFee;
  let reason: CodUnavailableReason | null = null;
  if (!settings.codEnabled) reason = "DISABLED";
  else if (!cityAllowed(city, settings.codCities)) reason = "CITY";
  else if (total + fee > settings.codMaxAmount) reason = "AMOUNT";
  return { available: reason === null, reason, fee, maxAmount: settings.codMaxAmount, cities: settings.codEnabled ? settings.codCities : [] };
}

export const COD_UNAVAILABLE_MESSAGE: Record<CodUnavailableReason, string> = {
  DISABLED: "El pago contra entrega no está disponible por ahora.",
  CITY: "El pago contra entrega no está disponible en esta ciudad.",
  AMOUNT: "El pedido supera el valor máximo para pago contra entrega.",
};
