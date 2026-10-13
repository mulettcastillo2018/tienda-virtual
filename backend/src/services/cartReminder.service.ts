import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { PRIVACY_POLICY_VERSION } from "../lib/privacy";
import { getEffectivePrice } from "../lib/pricing";
import { isValidLinkSignature, signLink } from "../lib/linkSignature";
import { DEFAULTS as CONTACT_DEFAULTS } from "../routes/contactInfo.routes";
import { sendCartReminderEmail } from "./email.service";

// Recordatorio de carrito abandonado. Es una comunicación comercial: solo va a
// quien autorizó las ofertas y aceptó la política vigente (la que menciona los
// recordatorios), una vez por cada pausa del carrito y con un enlace para darse
// de baja (Ley 1581 de 2012). Los carritos de invitado viven en el navegador:
// no hay a quién escribirle.
export const CART_REMINDER_AFTER_HOURS = Number(process.env.CART_REMINDER_AFTER_HOURS ?? 24);
// Pasada una semana ya no se recuerda: el cliente perdió el interés.
const MAX_AGE_DAYS = 7;
const INTERVAL_MS = 15 * 60_000;
const UNSUBSCRIBE = "baja-ofertas";

type Db = Prisma.TransactionClient | typeof prisma;

// Cada cambio del cliente en su carrito: vuelve a empezar la cuenta.
export function touchCart(db: Db, cartId: string) {
  return db.cart.update({ where: { id: cartId }, data: { lastActivityAt: new Date(), reminderSentAt: null } });
}

export function unsubscribeToken(userId: string) {
  return signLink(UNSUBSCRIBE, userId);
}

export function isValidUnsubscribeToken(userId: string, token: unknown) {
  return isValidLinkSignature(UNSUBSCRIBE, userId, token);
}

export function unsubscribeUrl(userId: string) {
  const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
  return `${frontend}/privacidad/baja?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

// Baja de un clic desde el cliente de correo (cabecera List-Unsubscribe, RFC 8058).
function oneClickUnsubscribeUrl(userId: string) {
  const backend = process.env.BACKEND_URL ?? "http://localhost:4000";
  return `${backend}/privacy/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

// userIds limita el envío a esas cuentas (pruebas o un envío dirigido).
export async function sendCartReminders(options: { now?: Date; userIds?: string[] } = {}) {
  if (!(CART_REMINDER_AFTER_HOURS > 0)) return [];
  const now = options.now ?? new Date();
  const carts = await prisma.cart.findMany({
    where: {
      reminderSentAt: null,
      lastActivityAt: { lte: new Date(now.getTime() - CART_REMINDER_AFTER_HOURS * 3600_000), gte: new Date(now.getTime() - MAX_AGE_DAYS * 86400_000) },
      items: { some: {} },
      ...(options.userIds ? { userId: { in: options.userIds } } : {}),
      user: { isActive: true, deletedAt: null, marketingOptIn: true, privacyVersion: PRIVACY_POLICY_VERSION },
    },
    select: {
      id: true,
      lastActivityAt: true,
      user: { select: { id: true, email: true } },
      items: { select: { quantity: true, product: { select: { name: true, price: true, discountPercentage: true, discountEndsAt: true, stock: true, isActive: true } } } },
    },
    orderBy: { lastActivityAt: "asc" },
    take: 50,
  });
  if (carts.length === 0) return [];

  const contact = await prisma.contactInfo.findUnique({ where: { id: "main" }, select: { legalName: true, nit: true } });
  const merchant = { name: contact?.legalName || CONTACT_DEFAULTS.legalName, nit: contact?.nit || null };
  const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
  const sent: { cartId: string; userId: string; items: number }[] = [];

  for (const cart of carts) {
    // Solo lo que todavía se puede comprar (y hasta lo que hay en bodega).
    const items = cart.items
      .filter((item) => item.product.isActive && item.product.stock > 0)
      .map((item) => ({ name: item.product.name, quantity: Math.min(item.quantity, item.product.stock), price: getEffectivePrice(item.product) }));
    // Si nada está disponible no se marca: puede volver a haber antes de la semana.
    if (items.length === 0) continue;
    // Se marca antes de enviar y solo si el carrito no cambió mientras tanto:
    // nunca salen dos recordatorios por la misma pausa.
    const claimed = await prisma.cart.updateMany({
      where: { id: cart.id, reminderSentAt: null, lastActivityAt: cart.lastActivityAt },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) continue;
    try {
      await sendCartReminderEmail(cart.user.email, {
        items,
        cartUrl: `${frontend}/cart?utm_source=recordatorio-carrito&utm_medium=email`,
        unsubscribeUrl: unsubscribeUrl(cart.user.id),
        oneClickUnsubscribeUrl: oneClickUnsubscribeUrl(cart.user.id),
        merchant,
      });
    } catch (err) {
      console.error(`No se pudo enviar el recordatorio del carrito ${cart.id}:`, err);
    }
    sent.push({ cartId: cart.id, userId: cart.user.id, items: items.length });
  }
  return sent;
}

export function startCartReminderJob() {
  if (!(CART_REMINDER_AFTER_HOURS > 0)) return;
  const run = () =>
    sendCartReminders()
      .then((sent) => sent.length > 0 && console.log(`Recordatorios de carrito enviados: ${sent.length}.`))
      .catch((err) => console.error("Error enviando recordatorios de carrito:", err));
  setTimeout(run, 60_000);
  setInterval(run, INTERVAL_MS);
}
