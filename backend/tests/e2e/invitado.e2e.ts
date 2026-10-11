import { prisma } from "../../src/lib/prisma";
import { orderAccessToken } from "../../src/lib/orderAccess";
import { crearAdmin, crearCliente, crearProducto, enviarWebhook, eventoWompi, exigir, limpiar, req, verificar, API_URL, type Creados } from "./_utilidades";

// Compra sin cuenta: carrito en el navegador, cotización, pedido, acceso con
// el enlace firmado (y sin él), pago, cancelación y privacidad.
export async function probarInvitado() {
  const creados: Creados = { usuarios: [], productos: [] };
  const configuracionAntes = await prisma.storeSettings.findUnique({ where: { id: "main" } });
  try {
    const admin = await crearAdmin(creados);
    const cliente = await crearCliente(creados, "invitado_e2e");
    const producto = await crearProducto(creados, "E2E Invitado Producto", 10, 30000);
    const retirado = await crearProducto(creados, "E2E Invitado Retirado", 10, 30000);
    await prisma.product.update({ where: { id: retirado.id }, data: { isActive: false } });
    const correo = `Invitado_${Date.now()}@Tienda.test`;
    const direccion = { fullName: "Invitada E2E", addressLine1: "Carrera 70 # 10-20", city: "Medellín", state: "Antioquia", postalCode: "050021", phone: "3009998877" };
    const comprar = (items: { productId: string; quantity: number }[], extra: object = {}) =>
      req("POST", "/orders/guest-checkout", { email: correo, address: direccion, items, ...extra });
    // Peticiones con el enlace del pedido (cabecera X-Order-Token).
    const conEnlace = async (method: string, path: string, token: string | undefined) => {
      const res = await fetch(API_URL + path, { method, headers: { "Content-Type": "application/json", ...(token ? { "X-Order-Token": token } : {}) } });
      return { status: res.status, data: await res.json().catch(() => null) };
    };
    const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).stock;

    console.log("[invitado] Carrito en el navegador");
    const carrito = exigir(
      await req("POST", "/cart/guest", { items: [{ productId: producto.id, quantity: 2 }, { productId: retirado.id, quantity: 1 }, { productId: "no-existe", quantity: 1 }] }),
      "Ver carrito de invitado"
    );
    verificar(carrito.items.length === 2 && carrito.items.find((i: { productId: string }) => i.productId === retirado.id)?.issue === "INACTIVE", "trae los productos al día, avisa el retirado y omite el que no existe");
    verificar((await req("POST", "/cart/guest/check", { productId: retirado.id, quantity: 1 })).status === 404, "no deja agregar un producto retirado");
    const demas = await req("POST", "/cart/guest/check", { productId: producto.id, quantity: 3, inCart: 8 });
    verificar(demas.status === 409 && String(demas.data?.error).includes("ya tienes 8"), "ni pasar del inventario (con lo que ya tiene)");
    verificar((await req("POST", "/cart/guest/check", { productId: producto.id, quantity: 2, inCart: 8 })).status === 200, "sí lo que alcanza");

    console.log("\n[invitado] Cotización y pedido");
    const cotizacion = exigir(await req("POST", "/orders/quote", { address: { city: "Medellín", postalCode: "050021" }, items: [{ productId: producto.id, quantity: 2 }] }), "Cotizar");
    verificar(cotizacion.subtotal === 60000 && cotizacion.total === 60000 + cotizacion.shippingCost, "cotiza sin sesión");
    verificar((await req("POST", "/orders/quote", { shippingAddressId: "x", items: [{ productId: producto.id, quantity: 1 }] })).status === 401, "una dirección guardada exige sesión");
    verificar((await req("POST", "/orders/guest-checkout", { email: "no-es-correo", address: direccion, items: [{ productId: producto.id, quantity: 1 }] })).status === 400, "correo inválido → 400");
    verificar((await comprar([{ productId: retirado.id, quantity: 1 }])).status === 409, "no compra un producto retirado");
    const antes = await stock();
    const pedido = exigir(await comprar([{ productId: producto.id, quantity: 2 }]), "Pedido de invitado");
    const guardado = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    verificar(
      guardado.userId === null && guardado.guestEmail === correo.toLowerCase() && guardado.shippingFullName === "Invitada E2E" && guardado.shippingAddressId === null,
      "queda sin cuenta, con el correo en minúsculas y la dirección copiada"
    );
    verificar(typeof pedido.accessToken === "string" && (await stock()) === antes - 2 && pedido.totalAmount === cotizacion.total, "reserva el inventario y devuelve el enlace de acceso");

    console.log("\n[invitado] Acceso con el enlace");
    const visto = await conEnlace("GET", `/orders/guest/${pedido.id}`, pedido.accessToken);
    verificar(visto.status === 200 && visto.data.status === "PENDING" && visto.data.shippingAddress.city === "Medellín" && visto.data.timeline.length === 1, "con el enlace ve su pedido");
    verificar((await conEnlace("GET", `/orders/guest/${pedido.id}`, undefined)).status === 404, "sin el enlace no");
    verificar((await conEnlace("GET", `/orders/guest/${pedido.id}`, `${pedido.accessToken}x`)).status === 404, "ni con un enlace alterado");
    const deCuenta = exigir(await req("POST", "/addresses", { ...direccion }, cliente.token), "Dirección cliente");
    exigir(await req("POST", "/cart/items", { productId: producto.id, quantity: 1 }, cliente.token), "Carrito cliente");
    const pedidoCuenta = exigir(await req("POST", "/orders/checkout", { shippingAddressId: deCuenta.id }, cliente.token), "Pedido con cuenta");
    verificar((await conEnlace("GET", `/orders/guest/${pedidoCuenta.id}`, orderAccessToken(pedidoCuenta.id))).status === 404, "el enlace no sirve para pedidos de una cuenta");
    verificar((await conEnlace("POST", `/payments/wompi/sync/${pedidoCuenta.id}`, pedido.accessToken)).status === 404, "ni el token de un pedido sirve para otro");

    console.log("\n[invitado] Pago");
    const intento = await conEnlace("POST", `/payments/wompi/initiate/${pedido.id}`, pedido.accessToken);
    verificar(intento.status === 200 && Boolean(intento.data.reference), "abre el pago con el enlace");
    exigir(await enviarWebhook(eventoWompi({ id: `e2e-invitado-${pedido.id}`, reference: intento.data.reference, status: "APPROVED", amount_in_cents: pedido.totalAmount * 100 })), "Webhook");
    const sync = await conEnlace("POST", `/payments/wompi/sync/${pedido.id}`, pedido.accessToken);
    verificar(sync.status === 200 && sync.data.status === "PAID" && sync.data.guest === true, "el pago aprobado marca el pedido pagado");
    verificar((await conEnlace("POST", `/orders/guest/${pedido.id}/cancel`, pedido.accessToken)).status === 409, "pagado ya no se cancela");

    console.log("\n[invitado] Cancelación y contra entrega");
    const otro = exigir(await comprar([{ productId: producto.id, quantity: 1 }]), "Otro pedido");
    const antesCancelar = await stock();
    verificar((await conEnlace("POST", `/orders/guest/${otro.id}/cancel`, otro.accessToken)).status === 200 && (await stock()) === antesCancelar + 1, "cancela un pendiente con el enlace y el inventario vuelve");
    await prisma.storeSettings.upsert({
      where: { id: "main" },
      create: { id: "main", codEnabled: true, codCities: ["Medellín"], codMaxAmount: 500000, codFee: 0 },
      update: { codEnabled: true, codCities: ["Medellín"], codMaxAmount: 500000, codFee: 0 },
    });
    const cod = exigir(await comprar([{ productId: producto.id, quantity: 1 }], { paymentOption: "CASH_ON_DELIVERY" }), "Invitado contra entrega");
    verificar(cod.paymentOption === "CASH_ON_DELIVERY" && cod.expiresAt === null, "también puede pagar contra entrega");

    console.log("\n[invitado] Privacidad y panel");
    const mios = exigir(await req("GET", "/orders/me", undefined, cliente.token), "Mis pedidos") as { id: string }[];
    verificar(mios.length === 1 && mios[0].id === pedidoCuenta.id, "los pedidos de invitado no aparecen en ninguna cuenta");
    const enPanel = exigir(await req("GET", `/orders?q=${encodeURIComponent(correo)}`, undefined, admin.token), "Buscar en el panel");
    verificar(enPanel.total === 3 && enPanel.items.every((o: { guestEmail: string; user: unknown }) => o.guestEmail === correo.toLowerCase() && o.user === null), "el panel los encuentra por el correo del invitado");
  } finally {
    if (configuracionAntes) {
      const { id: _id, updatedAt: _u, ...data } = configuracionAntes;
      await prisma.storeSettings.update({ where: { id: "main" }, data });
    } else {
      await prisma.storeSettings.deleteMany({ where: { id: "main" } });
    }
    await limpiar(creados);
  }
}
