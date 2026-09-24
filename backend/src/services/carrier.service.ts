// Cotizador simulado de transportadoras locales colombianas (Envía / Interrapidísimo).
// No consume una API real: aplica reglas fijas de negocio, tal como permite la guía del proyecto.

const MAIN_CITY_POSTAL_PREFIXES = ["11", "05", "76", "08", "13", "68", "17"]; // Bogotá, Medellín, Cali, Barranquilla, Cartagena, Bucaramanga, Manizales (aprox.)

const BASE_RATE_MAIN_CITY = 10_000; // COP
const BASE_RATE_SPECIAL = 18_000; // COP
const SURCHARGE_PER_KG_AFTER_2KG = 1_500; // COP
const FREE_WEIGHT_GRAMS = 2_000;

export interface ShippingQuote {
  carrier: "Envía" | "Interrapidísimo";
  cost: number;
}

export function calculateShippingQuote(
  destinationPostalCode: string,
  totalWeightInGrams: number
): ShippingQuote {
  const prefix = destinationPostalCode.slice(0, 2);
  const isMainCity = MAIN_CITY_POSTAL_PREFIXES.includes(prefix);

  const baseRate = isMainCity ? BASE_RATE_MAIN_CITY : BASE_RATE_SPECIAL;
  const extraGrams = Math.max(0, totalWeightInGrams - FREE_WEIGHT_GRAMS);
  const extraKg = Math.ceil(extraGrams / 1000);
  const surcharge = extraKg * SURCHARGE_PER_KG_AFTER_2KG;

  return {
    carrier: isMainCity ? "Envía" : "Interrapidísimo",
    cost: baseRate + surcharge,
  };
}
