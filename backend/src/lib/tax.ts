// IVA en Colombia: los precios de la tienda ya lo incluyen. Tarifas: 19 %
// (general), 5 % (algunos bienes) y 0 (excluido).
export const TAX_RATES = [0, 5, 19] as const;
export type TaxRate = (typeof TAX_RATES)[number];

// IVA contenido en un valor que ya lo incluye, en pesos redondeados.
export function includedTax(gross: number, rate: number) {
  if (rate <= 0) return 0;
  return Math.round(gross - gross / (1 + rate / 100));
}

// Tipos de documento de identidad de la DIAN que la tienda acepta para
// facturar a nombre de alguien.
export const ID_TYPES = {
  "13": "Cédula de ciudadanía",
  "31": "NIT",
  "22": "Cédula de extranjería",
  "41": "Pasaporte",
} as const;
export type IdType = keyof typeof ID_TYPES;

// Dígito de verificación del NIT (algoritmo de la DIAN).
export function nitCheckDigit(nit: string): string {
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = nit.replace(/\D/g, "").split("").reverse();
  const sum = digits.reduce((total, digit, i) => total + Number(digit) * (weights[i] ?? 0), 0);
  const rest = sum % 11;
  return String(rest > 1 ? 11 - rest : rest);
}

// "900123456-7" → { number: "900123456", dv: "7" } si el dígito es correcto; null si no.
export function parseNit(value: string): { number: string; dv: string } | null {
  const match = value.replace(/[.\s]/g, "").match(/^(\d{6,10})-?(\d)$/);
  if (!match) return null;
  return nitCheckDigit(match[1]) === match[2] ? { number: match[1], dv: match[2] } : null;
}
