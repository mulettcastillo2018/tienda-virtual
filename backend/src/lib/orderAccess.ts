import crypto from "node:crypto";

// Enlace de un pedido hecho sin cuenta: el token es una firma HMAC del id del
// pedido, así que no se guarda en la base y se puede volver a generar (para
// los correos que salen después, como el de pago aprobado o el de despacho).
function signingKey() {
  const secret = process.env.ORDER_LINK_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta ORDER_LINK_SECRET o JWT_SECRET para firmar los enlaces de pedidos");
  return secret;
}

export function orderAccessToken(orderId: string) {
  return crypto.createHmac("sha256", signingKey()).update(`pedido:${orderId}`).digest("base64url");
}

export function isValidOrderToken(orderId: string, token: unknown) {
  if (typeof token !== "string" || token.length === 0) return false;
  const expected = Buffer.from(orderAccessToken(orderId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export function guestOrderUrl(orderId: string) {
  const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
  return `${frontend}/pedido/${orderId}?t=${orderAccessToken(orderId)}`;
}
