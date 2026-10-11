import { prisma } from "../../src/lib/prisma";
import { crearAdmin, crearCliente, crearProducto, enviarWebhook, eventoWompi, exigir, limpiar, req, verificar, API_URL, type Creados } from "./_utilidades";

// Retracto (Ley 1480, art. 47) y reversión del pago (art. 51): plazos, una
// solicitud por pedido, trámite en el panel, inventario y reembolso.
export async function probarDevoluciones() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const cliente = await crearCliente(creados, "devol_e2e");
    const admin = await crearAdmin(creados);
    const producto = await crearProducto(creados, "E2E Devoluciones Producto", 20, 40000);
    const direccion = exigir(
      await req("POST", "/addresses", { fullName: "Cliente Devol E2E", addressLine1: "Calle 1 # 2-3", city: "Pasto", state: "Nariño", postalCode: "520001", phone: "3001234567" }, cliente.token),
      "Dirección"
    );
    const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).stock;
    const comprarYPagar = async (cantidad: number) => {
      exigir(await req("POST", "/cart/items", { productId: producto.id, quantity: cantidad }, cliente.token), "Carrito");
      const pedido = exigir(await req("POST", "/orders/checkout", { shippingAddressId: direccion.id }, cliente.token), "Checkout");
      const intento = exigir(await req("POST", `/payments/wompi/initiate/${pedido.id}`, undefined, cliente.token), "Pago");
      exigir(await enviarWebhook(eventoWompi({ id: `e2e-devol-${pedido.id}`, reference: intento.reference, status: "APPROVED", amount_in_cents: pedido.totalAmount * 100 })), "Webhook");
      return pedido as { id: string; totalAmount: number };
    };
    const entregar = async (id: string) => {
      exigir(await req("POST", `/orders/${id}/dispatch`, { carrier: "Envía", trackingNumber: `DEV-${id.slice(-4)}` }, admin.token), "Despachar");
      exigir(await req("POST", `/orders/${id}/deliver`, {}, admin.token), "Entregar");
    };
    const ver = async (id: string) => exigir(await req("GET", `/orders/${id}`, undefined, cliente.token), "Ver pedido");
    const pedir = (orderId: string, type: string, extra: object = {}) => req("POST", "/returns", { orderId, type, ...extra }, cliente.token);
    const paso = (id: string, ruta: string, body: object = {}, token = admin.token) => req("POST", `/returns/${id}/${ruta}`, body, token);

    console.log("[devoluciones] Retracto");
    const p1 = await comprarYPagar(2);
    verificar((await pedir(p1.id, "RETRACTO")).status === 409, "antes de la entrega no hay retracto");
    await entregar(p1.id);
    const visto = await ver(p1.id);
    verificar(visto.returnOptions.RETRACTO.available === true && Boolean(visto.returnOptions.RETRACTO.deadline), "entregado: el pedido ofrece el retracto con su plazo");
    const retracto = await pedir(p1.id, "RETRACTO", { note: "Ya no lo necesito" });
    verificar(retracto.status === 201 && retracto.data.status === "REQUESTED", "el cliente se retracta");
    verificar((await pedir(p1.id, "RETRACTO")).status === 409, "una sola solicitud vigente por pedido");
    verificar((await ver(p1.id)).returnRequests[0].status === "REQUESTED", "la solicitud se ve en su pedido");
    verificar((await paso(retracto.data.id, "approve", {}, cliente.token)).status === 403, "solo el admin la tramita");
    verificar((await paso(retracto.data.id, "refund", { reference: "REF-1" })).status === 409, "no se reembolsa sin aprobar");
    exigir(await paso(retracto.data.id, "approve", { note: "Envíalo por Envía con la guía que te llegará" }), "Aprobar");
    const antesRecibir = await stock();
    exigir(await paso(retracto.data.id, "receive"), "Recibir");
    verificar((await stock()) === antesRecibir + 2, "al recibir el producto vuelve al inventario");
    verificar((await paso(retracto.data.id, "refund", { reference: "x" })).status === 400, "el reembolso exige su referencia");
    exigir(await paso(retracto.data.id, "refund", { reference: "WOMPI-REEMBOLSO-1" }), "Reembolsar");
    const reembolsado = await prisma.order.findUniqueOrThrow({ where: { id: p1.id }, include: { statusLogs: true } });
    verificar(reembolsado.status === "REFUNDED" && reembolsado.statusLogs.some((l) => l.toStatus === "REFUNDED" && l.reason?.includes("WOMPI-REEMBOLSO-1")), "el pedido queda reembolsado, con la referencia en la bitácora");
    verificar((await stock()) === antesRecibir + 2, "el reembolso no devuelve el inventario dos veces");

    console.log("\n[devoluciones] Plazo");
    const p2 = await comprarYPagar(1);
    await entregar(p2.id);
    // La entrega fue hace dos semanas: el plazo de 5 días hábiles ya pasó.
    await prisma.orderStatusLog.updateMany({ where: { orderId: p2.id, toStatus: "DELIVERED" }, data: { changedAt: new Date(Date.now() - 14 * 86_400_000) } });
    verificar((await ver(p2.id)).returnOptions.RETRACTO.available === false && (await pedir(p2.id, "RETRACTO")).status === 409, "fuera de los 5 días hábiles no hay retracto");

    console.log("\n[devoluciones] Reversión del pago");
    const p3 = await comprarYPagar(1);
    const antesReversion = await stock();
    verificar((await pedir(p3.id, "REVERSION")).status === 400, "la reversión exige su causal");
    const reversion = await pedir(p3.id, "REVERSION", { cause: "NO_SOLICITADA", note: "No hice esta compra" });
    verificar(reversion.status === 201 && reversion.data.cause === "NO_SOLICITADA", "se pide con la causal del art. 51");
    exigir(await paso(reversion.data.id, "approve"), "Aprobar reversión");
    exigir(await paso(reversion.data.id, "refund", { reference: "REVERSION-BANCO-7" }), "Reembolsar reversión");
    verificar((await prisma.order.findUniqueOrThrow({ where: { id: p3.id } })).status === "REFUNDED" && (await stock()) === antesReversion + 1, "sin despachar, el reembolso devuelve el inventario reservado");

    console.log("\n[devoluciones] Rechazo y panel");
    const p4 = await comprarYPagar(1);
    await entregar(p4.id);
    const otra = exigir(await pedir(p4.id, "RETRACTO"), "Retracto p4");
    verificar((await paso(otra.id, "reject", { note: "x" })).status === 400, "rechazar exige explicar por qué");
    exigir(await paso(otra.id, "reject", { note: "El producto llegó usado y sin empaque" }), "Rechazar");
    verificar((await prisma.order.findUniqueOrThrow({ where: { id: p4.id } })).status === "DELIVERED", "un rechazo no cambia el pedido");
    verificar((await ver(p4.id)).returnOptions.RETRACTO.available === true, "rechazada, puede volver a pedirla si sigue en plazo");
    const panel = exigir(await req("GET", "/returns?status=REFUNDED&pageSize=100", undefined, admin.token), "Panel");
    verificar(panel.items.some((r: { id: string }) => r.id === retracto.data.id) && panel.counts.REFUNDED >= 2, "el panel las lista por estado");
    verificar((await req("GET", "/returns", undefined, cliente.token)).status === 403, "un cliente no ve el panel");

    console.log("\n[devoluciones] Invitado");
    const enlace = exigir(
      await req("POST", "/orders/guest-checkout", {
        email: `invitado_devol_${Date.now()}@tienda.test`,
        address: { fullName: "Invitado Devol", addressLine1: "Calle 2 # 3-4", city: "Pasto", state: "Nariño", postalCode: "520001", phone: "3001234567" },
        items: [{ productId: producto.id, quantity: 1 }],
        acceptPrivacy: true,
      }),
      "Pedido de invitado"
    );
    const intento = await fetch(`${API_URL}/payments/wompi/initiate/${enlace.id}`, { method: "POST", headers: { "X-Order-Token": enlace.accessToken } }).then((r) => r.json());
    exigir(await enviarWebhook(eventoWompi({ id: `e2e-devol-inv-${enlace.id}`, reference: intento.reference, status: "APPROVED", amount_in_cents: enlace.totalAmount * 100 })), "Webhook invitado");
    await entregar(enlace.id);
    const conToken = (token: string) =>
      fetch(`${API_URL}/returns/guest/${enlace.id}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Order-Token": token }, body: JSON.stringify({ type: "RETRACTO" }) });
    verificar((await conToken("token-falso")).status === 404, "sin el enlace no se puede pedir");
    verificar((await conToken(enlace.accessToken)).status === 201, "el invitado se retracta con el enlace de su pedido");
  } finally {
    await limpiar(creados);
  }
}
