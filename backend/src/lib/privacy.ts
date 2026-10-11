import type { ConsentPurpose, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Versión vigente de la política de tratamiento de datos (la que publica
// /privacidad en la tienda). Si el texto cambia de fondo, sube la versión y
// a cada cliente se le pide aceptarla de nuevo.
export const PRIVACY_POLICY_VERSION = "2026-10-12";

type Db = Prisma.TransactionClient | typeof prisma;

// Deja constancia de una autorización (o de su revocatoria): Ley 1581 de
// 2012 y Decreto 1377 de 2013 exigen poder probarla.
export function recordConsent(
  db: Db,
  input: { userId?: string | null; orderId?: string | null; email: string; purpose: ConsentPurpose; granted: boolean; channel: string; ipAddress?: string | null }
) {
  return db.consentRecord.create({
    data: {
      userId: input.userId ?? null,
      orderId: input.orderId ?? null,
      email: input.email,
      purpose: input.purpose,
      granted: input.granted,
      policyVersion: PRIVACY_POLICY_VERSION,
      channel: input.channel,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
