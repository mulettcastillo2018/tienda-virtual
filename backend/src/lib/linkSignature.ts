import crypto from "node:crypto";

// Firma de los enlaces que llegan por correo (pedido de invitado, baja de las
// ofertas): un HMAC del propósito y el id, así que no se guarda en la base y
// se puede volver a generar para cada correo.
function signingKey() {
  const secret = process.env.ORDER_LINK_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta ORDER_LINK_SECRET o JWT_SECRET para firmar los enlaces");
  return secret;
}

export function signLink(purpose: string, id: string) {
  return crypto.createHmac("sha256", signingKey()).update(`${purpose}:${id}`).digest("base64url");
}

export function isValidLinkSignature(purpose: string, id: string, token: unknown) {
  if (typeof token !== "string" || token.length === 0) return false;
  const expected = Buffer.from(signLink(purpose, id));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
