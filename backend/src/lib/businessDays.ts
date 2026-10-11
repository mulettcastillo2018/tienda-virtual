// Días hábiles en Colombia: lunes a viernes sin festivos, contados en la hora
// de Colombia (UTC-5, sin horario de verano). Plazos legales: respuesta de
// PQRS (15 días hábiles), retracto y reversión del pago (5 días hábiles).

const DAY_MS = 24 * 60 * 60_000;
const TZ_OFFSET_MS = 5 * 60 * 60_000;

// Domingo de Pascua (algoritmo anónimo gregoriano), como fecha UTC.
function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
// Ley Emiliani: el festivo que no cae en lunes se pasa al lunes siguiente.
const toMonday = (time: number) => {
  const weekday = new Date(time).getUTCDay();
  return weekday === 1 ? time : time + ((8 - weekday) % 7) * DAY_MS;
};

const holidaysByYear = new Map<number, Set<string>>();

// Festivos de Colombia de un año (Ley 51 de 1983), como AAAA-MM-DD.
export function colombianHolidays(year: number): Set<string> {
  const cached = holidaysByYear.get(year);
  if (cached) return cached;
  const date = (month: number, day: number) => Date.UTC(year, month - 1, day);
  const easter = easterSunday(year);
  const holidays = new Set<string>([
    // Fijos.
    ...[date(1, 1), date(5, 1), date(7, 20), date(8, 7), date(12, 8), date(12, 25)].map(iso),
    // Se trasladan al lunes.
    ...[date(1, 6), date(3, 19), date(6, 29), date(8, 15), date(10, 12), date(11, 1), date(11, 11)].map((t) => iso(toMonday(t))),
    // Semana Santa (fijos respecto a la Pascua).
    iso(easter - 3 * DAY_MS),
    iso(easter - 2 * DAY_MS),
    // Ascensión, Corpus Christi y Sagrado Corazón (trasladados al lunes).
    ...[39, 60, 68].map((days) => iso(toMonday(easter + days * DAY_MS))),
  ]);
  holidaysByYear.set(year, holidays);
  return holidays;
}

// El día (en Colombia) de un instante, como medianoche UTC de esa fecha.
function localDay(instant: Date) {
  const local = new Date(instant.getTime() - TZ_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

export function isBusinessDay(day: number) {
  const weekday = new Date(day).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !colombianHolidays(new Date(day).getUTCFullYear()).has(iso(day));
}

// Suma días hábiles conservando la hora (p. ej. el plazo de respuesta de una PQRS).
export function addBusinessDays(start: Date, days: number): Date {
  let day = localDay(start);
  let remaining = days;
  while (remaining > 0) {
    day += DAY_MS;
    if (isBusinessDay(day)) remaining -= 1;
  }
  return new Date(start.getTime() + (day - localDay(start)));
}

// Fin (23:59:59 en Colombia) del día hábil número `days` después de `start`:
// "dentro de los cinco días hábiles siguientes a la entrega".
export function businessDeadline(start: Date, days: number): Date {
  let day = localDay(start);
  let remaining = days;
  while (remaining > 0) {
    day += DAY_MS;
    if (isBusinessDay(day)) remaining -= 1;
  }
  return new Date(day + DAY_MS - 1 + TZ_OFFSET_MS);
}

export const PQRS_RESPONSE_DEADLINE_BUSINESS_DAYS = 15;
// Retracto (Ley 1480 de 2011, art. 47) y reversión del pago (art. 51).
export const RETURN_DEADLINE_BUSINESS_DAYS = 5;
