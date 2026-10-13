import { isValidLinkSignature, signLink } from "./linkSignature";

// Enlace de un pedido hecho sin cuenta: el token es una firma del id del
// pedido, así que no se guarda en la base y se puede volver a generar (para
// los correos que salen después, como el de pago aprobado o el de despacho).
export function orderAccessToken(orderId: string) {
  return signLink("pedido", orderId);
}

export function isValidOrderToken(orderId: string, token: unknown) {
  return isValidLinkSignature("pedido", orderId, token);
}

export function guestOrderUrl(orderId: string) {
  const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
  return `${frontend}/pedido/${orderId}?t=${orderAccessToken(orderId)}`;
}
