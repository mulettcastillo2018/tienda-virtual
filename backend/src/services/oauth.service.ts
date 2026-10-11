import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { PRIVACY_POLICY_VERSION, recordConsent } from "../lib/privacy";

export class OAuthLoginError extends Error {}

const LOGIN_CODE_TTL_MS = 2 * 60_000;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

// Usuario de una cuenta social: el que ya la tenía vinculada o uno nuevo.
// Nunca se vincula sola a una cuenta existente con el mismo correo: quien
// controle una cuenta de Google/Facebook con ese correo (o uno sin verificar)
// entraría a la cuenta de otra persona, incluida la de un administrador.
export async function findOrCreateOAuthUser(provider: "google" | "facebook", providerId: string, email: string) {
  const linked = await prisma.user.findUnique({ where: { provider_providerId: { provider, providerId } } });
  if (linked) return linked;

  const normalized = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    throw new OAuthLoginError("Ya tienes una cuenta con ese correo. Ingresa con tu correo y contraseña.");
  }

  // Al lado de los botones de Google y Facebook se avisa que continuar es
  // aceptar la política (autorización por conducta inequívoca, Decreto 1377 de 2013).
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: normalized, provider, providerId, privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_POLICY_VERSION },
    });
    await tx.cart.create({ data: { userId: user.id } });
    await recordConsent(tx, { userId: user.id, email: normalized, purpose: "DATA_PROCESSING", granted: true, channel: "OAUTH" });
    return user;
  });
}

// Código de un solo uso para entregarle la sesión al navegador sin poner el
// token en la URL.
export async function issueLoginCode(userId: string): Promise<string> {
  const code = crypto.randomBytes(32).toString("hex");
  await prisma.$transaction([
    // De paso se borran los códigos viejos (usados o vencidos) de todos.
    prisma.oAuthLoginCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
    prisma.oAuthLoginCode.create({ data: { codeHash: sha256(code), userId, expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS) } }),
  ]);
  return code;
}

// El usuario del código, o null si no existe, venció o ya se usó (aunque
// lleguen dos canjes a la vez, solo uno lo consigue).
export async function redeemLoginCode(code: string) {
  const codeHash = sha256(code);
  const redeemed = await prisma.oAuthLoginCode.updateMany({
    where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (redeemed.count === 0) return null;
  const record = await prisma.oAuthLoginCode.findUnique({ where: { codeHash }, include: { user: true } });
  return record?.user ?? null;
}
