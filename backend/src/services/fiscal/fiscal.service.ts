import { randomUUID } from "node:crypto";
import { Prisma, type FiscalDocument, type FiscalDocumentType, type FiscalSettings } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { nitCheckDigit } from "../../lib/tax";
import { AlanubeConnectionError, fetchStatus, issue, readStatus, type AlanubeResponse, type Connection } from "./alanube";
import { buildDocument, dianPaymentMethod, FINAL_CONSUMER, type Buyer, type Resolution, type SaleLine } from "./document";

// Factura electrónica de cada venta (y nota crédito al reembolsar), enviada a
// la DIAN por Alanube. Adaptado del módulo de comidas-rapidas: numeración con
// bloqueo, envío idempotente, consulta asíncrona de la respuesta de la DIAN y
// reintentos con espera creciente. La venta nunca se frena por la factura.

const INTERVAL_MS = 20_000;
const WAITS_MS = [5_000, 15_000, 30_000, 60_000, 2 * 60_000, 5 * 60_000, 10 * 60_000, 30 * 60_000];
const waitFor = (attempts: number) => WAITS_MS[Math.min(attempts, WAITS_MS.length - 1)];
const MAX_FAILURES = 5;

export class FiscalError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function fiscalSettings() {
  return prisma.fiscalSettings.upsert({ where: { id: "main" }, create: {}, update: {} });
}

// El token puede venir del entorno (recomendado) o guardarse en el panel.
export function connectionOf(s: FiscalSettings): Connection | null {
  const token = process.env.ALANUBE_TOKEN || s.alanubeToken;
  return token ? { url: s.alanubeUrl, token } : null;
}

function invoiceResolution(s: FiscalSettings, prefix = s.prefix ?? ""): Resolution | null {
  if (!s.resolutionNumber || !s.prefix || s.rangeFrom === null || s.rangeTo === null || !s.startDate || !s.endDate) return null;
  return { number: s.resolutionNumber, prefix, from: s.rangeFrom, to: s.rangeTo, startDate: s.startDate, endDate: s.endDate, technicalKey: s.technicalKey };
}

// Qué falta configurar para emitir (vacío = listo).
export async function missingSetup(s: FiscalSettings): Promise<string[]> {
  const missing: string[] = [];
  if (!connectionOf(s)) missing.push("el token de Alanube");
  if (!s.alanubeCompanyId) missing.push("la compañía en Alanube");
  if (!invoiceResolution(s)) missing.push("la resolución de facturación electrónica");
  if (!s.technicalKey) missing.push("la clave técnica de la resolución");
  const contact = await prisma.contactInfo.findUnique({ where: { id: "main" }, select: { legalName: true, nit: true } });
  if (!contact?.nit) missing.push("el NIT del comerciante (en Contacto)");
  return missing;
}

const today = () => new Date(Date.now() - 5 * 60 * 60_000).toISOString().slice(0, 10);

// Siguiente número, bloqueando la configuración para que dos ventas
// simultáneas no reciban el mismo.
async function assignNumber(tx: Prisma.TransactionClient, type: FiscalDocumentType) {
  await tx.$queryRaw`SELECT id FROM "FiscalSettings" WHERE id = 'main' FOR UPDATE`;
  const s = await tx.fiscalSettings.findUniqueOrThrow({ where: { id: "main" } });
  const missing = await missingSetup(s);
  if (missing.length > 0) throw new FiscalError(409, `Para facturar electrónicamente falta configurar: ${missing.join(", ")}.`);
  if (type === "CREDIT_NOTE") {
    await tx.fiscalSettings.update({ where: { id: "main" }, data: { creditNoteNext: s.creditNoteNext + 1 } });
    return { settings: s, prefix: s.creditNotePrefix, number: s.creditNoteNext, resolution: invoiceResolution(s, s.creditNotePrefix) };
  }
  const resolution = invoiceResolution(s)!;
  const number = s.nextNumber ?? resolution.from;
  if (number > resolution.to) throw new FiscalError(409, `Se acabó la numeración autorizada (${resolution.prefix} hasta ${resolution.to}). Pide una nueva resolución a la DIAN.`);
  if (resolution.endDate < today()) throw new FiscalError(409, `La resolución ${resolution.number} venció el ${resolution.endDate}.`);
  await tx.fiscalSettings.update({ where: { id: "main" }, data: { nextNumber: number + 1 } });
  return { settings: s, prefix: resolution.prefix, number, resolution };
}

// Contenido del documento a partir del pedido: productos con su IVA, envío y
// recargo contra entrega como líneas, y el comprador (a su nombre o
// consumidor final, con el correo para que le llegue).
async function buildContent(
  orderId: string,
  type: FiscalDocumentType,
  numbering: { settings: FiscalSettings; prefix: string; number: number; resolution: Resolution | null },
  extra: { reference?: FiscalDocument; reason?: string } = {}
) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { name: true, sku: true } } } },
      user: { select: { email: true } },
      payments: { where: { status: "APPROVED" }, select: { paymentMethod: true } },
    },
  });
  const shippingRate = numbering.settings.shippingTaxRate;
  const lines: SaleLine[] = order.items.map((item) => ({
    description: item.product.name,
    code: item.product.sku,
    quantity: item.quantity,
    unitPrice: item.priceAtPurchase,
    taxRate: item.taxRate,
  }));
  if (order.shippingCost > 0) lines.push({ description: `Envío (${order.carrier ?? "transportadora"})`, code: "ENVIO", quantity: 1, unitPrice: order.shippingCost, taxRate: shippingRate });
  if (order.codFee > 0) lines.push({ description: "Recargo pago contra entrega", code: "CONTRAENTREGA", quantity: 1, unitPrice: order.codFee, taxRate: shippingRate });

  const email = order.user?.email ?? order.guestEmail ?? null;
  let buyer: Buyer = { ...FINAL_CONSUMER, email };
  if (order.billingIdType && order.billingIdNumber && order.billingName) {
    buyer = {
      idType: order.billingIdType,
      idNumber: order.billingIdNumber,
      // El NIT se guarda sin dígito de verificación; la DIAN lo pide aparte.
      dv: order.billingIdType === "31" ? nitCheckDigit(order.billingIdNumber) : null,
      name: order.billingName,
      email,
    };
  }
  const paymentMethods = order.paymentOption === "CASH_ON_DELIVERY" ? ["10"] : order.payments.map((p) => dianPaymentMethod(p.paymentMethod));
  const content = buildDocument({
    type,
    number: numbering.number,
    prefix: numbering.prefix,
    resolution: numbering.resolution,
    companyId: numbering.settings.alanubeCompanyId ?? "",
    buyer,
    lines,
    paymentMethods,
    note: `Pedido ${order.id.slice(-8)}`,
    ...(extra.reference
      ? {
          reference: {
            alanubeId: extra.reference.alanubeId,
            fullNumber: `${extra.reference.prefix}${extra.reference.number}`,
            uniqueCode: extra.reference.uniqueCode,
            date: extra.reference.createdAt.toISOString().slice(0, 10),
          },
          reason: extra.reason,
        }
      : {}),
  });
  return { content, buyer, total: order.totalAmount };
}

function duplicatedNumber(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new FiscalError(409, "El siguiente número de la numeración ya se usó. Revísalo en Facturación electrónica.");
  }
  throw err;
}

async function createDocument(orderId: string, type: FiscalDocumentType, extra: { reference?: FiscalDocument; reason?: string } = {}) {
  return prisma
    .$transaction(async (tx) => {
      const numbering = await assignNumber(tx, type);
      const { content, buyer, total } = await buildContent(orderId, type, numbering, extra);
      return tx.fiscalDocument.create({
        data: {
          orderId,
          type,
          prefix: numbering.prefix,
          number: numbering.number,
          content: content as Prisma.InputJsonValue,
          idempotencyKey: randomUUID(),
          customerName: buyer.name,
          customerId: buyer.idNumber,
          total,
          cancelsId: extra.reference?.id ?? null,
        },
      });
    })
    .catch(duplicatedNumber);
}

// Lo que respondió Alanube (al enviar o al consultar).
async function applyResponse(doc: FiscalDocument, r: AlanubeResponse) {
  const now = Date.now();
  const e = readStatus(r.data);
  const httpMessage = e.message ?? (e.errors[0] || `Alanube respondió ${r.status}`);
  // Otra solicitud con la misma clave en curso, o Alanube caído: más tarde.
  if (r.status === 409 || r.status === 429 || r.status >= 500) {
    await prisma.fiscalDocument.update({ where: { id: doc.id }, data: { message: httpMessage, nextAttemptAt: new Date(now + waitFor(doc.attempts)) } });
    return;
  }
  // Datos que Alanube no acepta (token, compañía, campos): hay que corregir.
  if (r.status >= 400) {
    const errors = e.errors.length > 0 ? e.errors : [typeof r.data === "string" ? r.data.slice(0, 300) : JSON.stringify(r.data).slice(0, 300)];
    await prisma.fiscalDocument.update({ where: { id: doc.id }, data: { status: "REJECTED", message: httpMessage, errors } });
    return;
  }
  const common = { alanubeId: e.id ?? doc.alanubeId, uniqueCode: e.uniqueCode ?? doc.uniqueCode, qr: e.qr ?? doc.qr, message: e.message, errors: e.errors };
  if (e.legalStatus === "ACCEPTED" || e.legalStatus === "ACCEPTED_WITH_OBSERVATIONS") {
    await prisma.fiscalDocument.update({ where: { id: doc.id }, data: { ...common, status: "ACCEPTED" } });
    return;
  }
  if (e.legalStatus === "REJECTED") {
    await prisma.fiscalDocument.update({ where: { id: doc.id }, data: { ...common, status: "REJECTED" } });
    return;
  }
  if (e.status === "FAILED") {
    // Hay que reenviarlo con otra clave (la misma devolvería el mismo fallo).
    const exhausted = doc.attempts >= MAX_FAILURES;
    await prisma.fiscalDocument.update({
      where: { id: doc.id },
      data: exhausted
        ? { ...common, status: "REJECTED" }
        : { ...common, status: "PENDING", idempotencyKey: randomUUID(), nextAttemptAt: new Date(now + waitFor(doc.attempts)) },
    });
    return;
  }
  // Recibido, esperando a la DIAN: se vuelve a preguntar.
  await prisma.fiscalDocument.update({
    where: { id: doc.id },
    data: { ...common, status: common.alanubeId ? "SENT" : "PENDING", nextAttemptAt: new Date(now + waitFor(doc.attempts)) },
  });
}

// Reserva el documento para este ciclo (y cuenta el intento): dos ciclos que
// se crucen no lo envían dos veces.
async function reserve(doc: FiscalDocument) {
  const taken = await prisma.fiscalDocument.updateMany({
    where: { id: doc.id, status: doc.status, nextAttemptAt: { lte: new Date() } },
    data: { nextAttemptAt: new Date(Date.now() + 2 * 60_000), attempts: { increment: 1 } },
  });
  return taken.count === 1 ? prisma.fiscalDocument.findUnique({ where: { id: doc.id } }) : null;
}

async function work(doc: FiscalDocument, s: FiscalSettings) {
  const connection = connectionOf(s);
  if (!connection) {
    await prisma.fiscalDocument.update({
      where: { id: doc.id },
      data: { message: "Falta el token de Alanube: configúralo en Facturación electrónica", nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
    });
    return;
  }
  const reserved = await reserve(doc);
  if (!reserved) return;
  try {
    const r =
      reserved.status === "SENT" && reserved.alanubeId
        ? await fetchStatus(connection, reserved.type, reserved.alanubeId)
        : await issue(connection, reserved.type, reserved.content, reserved.idempotencyKey);
    await applyResponse(reserved, r);
  } catch (err) {
    if (!(err instanceof AlanubeConnectionError)) throw err;
    await prisma.fiscalDocument.update({ where: { id: reserved.id }, data: { message: err.message, nextAttemptAt: new Date(Date.now() + waitFor(reserved.attempts)) } });
  }
}

// Ventas por facturar: pagadas en línea, o contra entrega ya entregadas (que
// es cuando se cobran), desde que se activó la facturación.
const soldOrders = (since: Date): Prisma.OrderWhereInput => ({
  createdAt: { gte: since },
  fiscalDocuments: { none: {} },
  OR: [
    { paymentOption: "ONLINE", status: { in: ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] } },
    { paymentOption: "CASH_ON_DELIVERY", status: "DELIVERED" },
  ],
});

let lastSetupWarning = "";

async function cycle() {
  const s = await fiscalSettings();
  if (!s.enabled || !s.enabledAt) return;

  for (const order of await prisma.order.findMany({ where: soldOrders(s.enabledAt), select: { id: true }, orderBy: { createdAt: "asc" }, take: 20 })) {
    try {
      await createDocument(order.id, "INVOICE");
    } catch (err) {
      if (!(err instanceof FiscalError)) throw err;
      if (err.message !== lastSetupWarning) console.warn(err.message);
      lastSetupWarning = err.message;
      break;
    }
  }

  // Pedidos reembolsados con factura aceptada y sin anular: nota crédito.
  const toCancel = await prisma.fiscalDocument.findMany({
    where: { type: "INVOICE", status: "ACCEPTED", cancelledBy: null, order: { status: "REFUNDED" } },
    take: 20,
  });
  for (const invoice of toCancel) {
    const request = await prisma.returnRequest.findFirst({ where: { orderId: invoice.orderId, status: "REFUNDED" }, select: { type: true } });
    try {
      await createDocument(invoice.orderId, "CREDIT_NOTE", { reference: invoice, reason: request?.type === "REVERSION" ? "Reversión del pago" : "Retracto del consumidor" });
    } catch (err) {
      if (!(err instanceof FiscalError)) throw err;
      break;
    }
  }

  const pending = await prisma.fiscalDocument.findMany({
    where: { status: { in: ["PENDING", "SENT"] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: 20,
  });
  for (const doc of pending) await work(doc, s);
}

let running: Promise<void> | null = null;
let again = false;

// Corre un ciclo ya; si hay uno en curso, le pide otra vuelta y espera a que termine.
export function processFiscalDocuments(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await cycle();
      } while (again);
    } catch (err) {
      console.error("Error en la facturación electrónica:", err);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Después de una venta o un reembolso: pronto, sin demorar la respuesta.
export function scheduleFiscalProcessing() {
  setTimeout(() => void processFiscalDocuments(), 500);
}

export function startFiscalJob() {
  return setInterval(() => void processFiscalDocuments(), INTERVAL_MS);
}

// Reembolso: la nota crédito la crea el ciclo en cuanto la factura esté
// aceptada (si todavía va en trámite, la espera).
export async function issueCreditNoteFor(_orderId: string, _reason: string) {
  scheduleFiscalProcessing();
}

// Reenvía un documento rechazado después de corregir la configuración o los
// datos: se arma de nuevo con el mismo número.
export async function resendDocument(id: string) {
  const doc = await prisma.fiscalDocument.findUnique({ where: { id }, include: { cancels: true } });
  if (!doc) throw new FiscalError(404, "Documento no encontrado");
  if (doc.status !== "REJECTED") throw new FiscalError(409, "Solo se reenvía un documento rechazado");
  const settings = await fiscalSettings();
  const resolution = invoiceResolution(settings, doc.prefix);
  const { content, buyer } = await buildContent(doc.orderId, doc.type, { settings, prefix: doc.prefix, number: doc.number, resolution }, {
    reference: doc.cancels ?? undefined,
    reason: doc.cancels ? "Anulación" : undefined,
  });
  const updated = await prisma.fiscalDocument.update({
    where: { id: doc.id },
    data: {
      status: "PENDING",
      content: content as Prisma.InputJsonValue,
      idempotencyKey: randomUUID(),
      errors: [],
      message: null,
      attempts: 0,
      nextAttemptAt: new Date(),
      customerName: buyer.name,
      customerId: buyer.idNumber,
    },
  });
  scheduleFiscalProcessing();
  return updated;
}

// Avisos de la numeración: pocos números o resolución por vencer.
export function numberingWarnings(s: FiscalSettings): string[] {
  const resolution = invoiceResolution(s);
  if (!resolution) return [];
  const warnings: string[] = [];
  const left = resolution.to - (s.nextNumber ?? resolution.from) + 1;
  if (left <= 0) warnings.push("Se acabó la numeración de facturación electrónica.");
  else if (left <= 200) warnings.push(`Quedan ${left} números de facturación: pide una nueva resolución a la DIAN.`);
  const limit = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  if (resolution.endDate < today()) warnings.push(`La resolución venció el ${resolution.endDate}.`);
  else if (resolution.endDate <= limit) warnings.push(`La resolución vence el ${resolution.endDate}.`);
  return warnings;
}
