// Suma días hábiles (lunes a viernes, sin festivos) a una fecha.
// Usado para el plazo legal de respuesta de PQRS (Ley 1480 de 2011: máx. 15 días hábiles).
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export const PQRS_RESPONSE_DEADLINE_BUSINESS_DAYS = 15;
