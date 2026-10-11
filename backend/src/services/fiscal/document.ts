// Arma el cuerpo que se envía a Alanube (factura electrónica de la DIAN) a
// partir de un pedido. Función pura: se prueba sin base de datos.
//
// Los precios de la tienda ya incluyen el IVA, con tarifa propia por producto
// (19 %, 5 % o 0 = excluido): aquí se separan base e impuesto por línea, que
// es como los pide la DIAN. Todo en centavos para no acumular redondeos.
// Adaptado del módulo de comidas-rapidas (que usa una sola tarifa de INC).

import type { FiscalDocumentType } from "@prisma/client";

export interface SaleLine {
  description: string;
  code?: string;
  quantity: number;
  // Precio por unidad en pesos, con el IVA incluido.
  unitPrice: number;
  taxRate: number;
}

export interface Buyer {
  // 13 cédula, 31 NIT, 22 cédula de extranjería, 41 pasaporte.
  idType: string;
  idNumber: string;
  dv?: string | null;
  name: string;
  email?: string | null;
}

// Quien no pide la factura a su nombre (DIAN: 222222222222).
export const FINAL_CONSUMER: Buyer = { idType: "13", idNumber: "222222222222", name: "Consumidor final" };

export interface Resolution {
  number: string;
  prefix: string;
  from: number;
  to: number;
  startDate: string;
  endDate: string;
  technicalKey?: string | null;
}

export interface DocumentData {
  type: FiscalDocumentType;
  number: number;
  prefix: string;
  companyId: string;
  resolution: Resolution | null;
  buyer: Buyer;
  lines: SaleLine[];
  // Códigos de medio de pago de la DIAN (10 efectivo, 48 tarjeta, 47 transferencia...).
  paymentMethods: string[];
  note: string;
  // Solo la nota crédito: la factura que anula.
  reference?: { alanubeId: string | null; fullNumber: string; uniqueCode: string | null; date: string };
  reason?: string;
}

const toPesos = (cents: number) => Math.round(cents) / 100;

export interface ComputedLine {
  description: string;
  code?: string;
  quantity: number;
  basePrice: number;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
}

export interface Totals {
  lines: ComputedLine[];
  base: number;
  taxable: number;
  tax: number;
  payable: number;
}

export function computeTotals(lines: SaleLine[]): Totals {
  const computed = lines.map((l): ComputedLine => {
    const rate = l.taxRate > 0 ? l.taxRate : 0;
    const baseCents = Math.round((l.unitPrice * 100) / (1 + rate / 100));
    const subtotal = baseCents * l.quantity;
    const tax = Math.round((subtotal * rate) / 100);
    return {
      description: l.description,
      code: l.code,
      quantity: l.quantity,
      basePrice: toPesos(baseCents),
      subtotal: toPesos(subtotal),
      taxRate: rate,
      tax: toPesos(tax),
      total: toPesos(subtotal + tax),
    };
  });
  const sum = (values: number[]) => Math.round(values.reduce((s, v) => s + v * 100, 0));
  const base = sum(computed.map((l) => l.subtotal));
  const taxable = sum(computed.filter((l) => l.taxRate > 0).map((l) => l.subtotal));
  const tax = sum(computed.map((l) => l.tax));
  return { lines: computed, base: toPesos(base), taxable: toPesos(taxable), tax: toPesos(tax), payable: toPesos(base + tax) };
}

function customer(b: Buyer) {
  const company = b.idType === "31";
  return {
    name: b.name,
    organizationType: company ? 1 : 2,
    identificationType: b.idType,
    identificationNumber: b.idNumber,
    ...(company && b.dv ? { dv: b.dv } : {}),
    taxCode: { id: "ZZ" },
    ...(b.email ? { email: b.email } : {}),
  };
}

export function buildDocument(d: DocumentData): Record<string, unknown> {
  const t = computeTotals(d.lines);
  const items = t.lines.map((l) => ({
    ...(l.code ? { sellersItemIdentification: { id: l.code.slice(0, 50) } } : {}),
    description: l.description,
    price: l.basePrice,
    quantity: l.quantity,
    unitCode: "94",
    subtotal: l.subtotal,
    taxAmount: l.tax,
    total: l.total,
    // IVA = tributo 01; los excluidos van sin impuesto.
    taxes: l.taxRate > 0 ? [{ taxCode: "01", taxPercentage: l.taxRate.toFixed(2), taxableAmount: l.subtotal, taxAmount: l.tax }] : [],
  }));
  const common = {
    company: { id: d.companyId },
    customer: customer(d.buyer),
    items,
    totalAmounts: {
      grossTotal: t.base,
      taxableTotal: t.taxable,
      taxTotal: t.tax,
      discountTotal: 0,
      chargeTotal: 0,
      payableTotal: t.payable,
      currencyCode: "COP",
    },
    // Forma de pago 1 = contado.
    payments: (d.paymentMethods.length > 0 ? [...new Set(d.paymentMethods)] : ["ZZZ"]).map((method) => ({ paymentForm: "1", paymentMethod: method })),
    note: [d.note],
  };
  const resolution = d.resolution
    ? {
        resolutionNumber: d.resolution.number,
        prefix: d.prefix,
        minNumber: d.resolution.from,
        maxNumber: d.resolution.to,
        startDate: d.resolution.startDate,
        endDate: d.resolution.endDate,
        ...(d.resolution.technicalKey ? { technicalKey: d.resolution.technicalKey } : {}),
      }
    : undefined;

  if (d.type === "INVOICE") return { documentType: "01", number: d.number, resolution, ...common };
  return {
    documentType: "01",
    number: d.number,
    resolution,
    ...common,
    creditNoteReference: d.reference?.alanubeId
      ? { id: d.reference.alanubeId }
      : { fullNumber: d.reference?.fullNumber, cude: d.reference?.uniqueCode, date: d.reference?.date },
    note: [d.reason ?? "Anulación", d.note],
  };
}

// Medio de pago de la DIAN según cómo se pagó en Wompi (o en efectivo).
export function dianPaymentMethod(method: string | null | undefined) {
  switch (method) {
    case "CASH":
      return "10";
    case "CARD":
      return "48";
    case "PSE":
    case "NEQUI":
    case "BANCOLOMBIA_TRANSFER":
    case "DAVIPLATA":
      return "47";
    default:
      return "ZZZ";
  }
}
