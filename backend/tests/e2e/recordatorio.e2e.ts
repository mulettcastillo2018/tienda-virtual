import { prisma } from "../../src/lib/prisma";
import { PRIVACY_POLICY_VERSION } from "../../src/lib/privacy";
import { sendCartReminders, unsubscribeToken, unsubscribeUrl } from "../../src/services/cartReminder.service";
import { API_URL, crearCliente, crearProducto, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

const HORA = 3600_000;

// Recordatorio de carrito abandonado: solo a quien autorizó las ofertas con la
// política vigente, una vez por pausa, con lo que se puede comprar, y con una
// baja que funciona sin iniciar sesión.
export async function probarRecordatorioCarrito() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const disponible = await crearProducto(creados, "E2E Recordatorio Disponible", 5, 30000);
    const agotado = await crearProducto(creados, "E2E Recordatorio Agotado", 0, 20000);
    const retirado = await crearProducto(creados, "E2E Recordatorio Retirado", 5, 10000);
    await prisma.product.update({ where: { id: retirado.id }, data: { isActive: false } });

    const quieto = (cartId: string, horas: number) =>
      prisma.cart.update({ where: { id: cartId }, data: { lastActivityAt: new Date(Date.now() - horas * HORA), reminderSentAt: null } });
    const carrito = (cartId: string) => prisma.cart.findUniqueOrThrow({ where: { id: cartId } });
    // Cliente con permiso para ofertas y la política vigente, y su carrito quieto desde hace `horas`.
    async function cliente(etiqueta: string, opciones: { ofertas?: boolean; version?: string; horas?: number; lineas?: [string, number][] } = {}) {
      const c = await crearCliente(creados, etiqueta);
      await prisma.user.update({
        where: { id: c.id },
        data: { marketingOptIn: opciones.ofertas ?? true, privacyVersion: opciones.version ?? PRIVACY_POLICY_VERSION, privacyAcceptedAt: new Date() },
      });
      const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: c.id } });
      for (const [productId, quantity] of opciones.lineas ?? [[disponible.id, 2]]) await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity } });
      await quieto(cart.id, opciones.horas ?? 25);
      return { ...c, cartId: cart.id };
    }

    const ok = await cliente("recordar_ok_e2e", { lineas: [[disponible.id, 2], [agotado.id, 1], [retirado.id, 1]] });
    const sinPermiso = await cliente("recordar_sinpermiso_e2e", { ofertas: false });
    const politicaVieja = await cliente("recordar_vieja_e2e", { version: "2026-10-12" });
    const reciente = await cliente("recordar_reciente_e2e", { horas: 2 });
    const antiguo = await cliente("recordar_antiguo_e2e", { horas: 24 * 8 });
    const nadaDisponible = await cliente("recordar_agotado_e2e", { lineas: [[agotado.id, 1]] });
    const recordar = (ids: string[]) => sendCartReminders({ userIds: ids });

    console.log("[recordatorio] A quién se le recuerda");
    const enviados = await recordar([ok, sinPermiso, politicaVieja, reciente, antiguo, nadaDisponible].map((c) => c.id));
    const para = (c: { id: string }) => enviados.find((e) => e.userId === c.id);
    verificar(para(ok)?.items === 1, "al cliente con permiso y el carrito quieto, solo con lo que se puede comprar");
    verificar(!para(sinPermiso) && !para(politicaVieja), "nunca a quien no autorizó las ofertas o no aceptó la política que las menciona");
    verificar(!para(reciente) && !para(antiguo), "ni antes de 24 horas ni pasada una semana");
    verificar(!para(nadaDisponible) && (await carrito(nadaDisponible.cartId)).reminderSentAt === null, "si nada está disponible no se envía (y queda pendiente por si vuelve)");
    verificar((await carrito(ok.cartId)).reminderSentAt !== null, "queda constancia del envío");

    console.log("\n[recordatorio] Una vez por pausa");
    verificar((await recordar([ok.id])).length === 0, "la siguiente vuelta no lo repite");
    exigir(await req("PUT", `/cart/items/${disponible.id}`, { quantity: 1 }, ok.token), "Cambiar cantidad");
    const tocado = await carrito(ok.cartId);
    verificar(tocado.reminderSentAt === null && Date.now() - tocado.lastActivityAt.getTime() < 60_000, "cambiar el carrito reinicia la cuenta");
    verificar((await recordar([ok.id])).length === 0, "recién cambiado no se recuerda");
    await quieto(ok.cartId, 30);
    verificar((await recordar([ok.id])).length === 1, "si vuelve a quedar quieto, otro recordatorio");

    console.log("\n[recordatorio] Darse de baja desde el correo");
    const enlace = new URL(unsubscribeUrl(ok.id));
    verificar(
      enlace.pathname === "/privacidad/baja" && enlace.searchParams.get("u") === ok.id && enlace.searchParams.get("t") === unsubscribeToken(ok.id),
      "el correo trae el enlace de baja firmado"
    );
    const baja = (u: string, t: string, init: RequestInit = {}) =>
      fetch(`${API_URL}/privacy/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`, { method: "POST", ...init });
    verificar((await baja(ok.id, "firma-falsa")).status === 400, "con una firma falsa no da de baja");
    verificar((await baja(sinPermiso.id, unsubscribeToken(ok.id))).status === 400, "ni con la firma de otra cuenta");
    verificar((await baja(ok.id, unsubscribeToken(ok.id))).status === 200, "con el enlace del correo se da de baja sin iniciar sesión");
    const revocatorias = () => prisma.consentRecord.count({ where: { userId: ok.id, purpose: "MARKETING", granted: false, channel: "CORREO" } });
    const usuario = await prisma.user.findUniqueOrThrow({ where: { id: ok.id } });
    verificar(!usuario.marketingOptIn && (await revocatorias()) === 1, "queda la revocatoria registrada (Ley 1581)");
    // RFC 8058: el cliente de correo envía un formulario a la URL de la cabecera.
    const unClic = await baja(ok.id, unsubscribeToken(ok.id), { headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    verificar(unClic.status === 200 && (await revocatorias()) === 1, "la baja de un clic responde bien y no duplica la constancia");
    await quieto(ok.cartId, 30);
    verificar((await recordar([ok.id])).length === 0, "después de la baja no se le vuelve a escribir");
  } finally {
    await limpiar(creados);
  }
}
