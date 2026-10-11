import { prisma } from "../../src/lib/prisma";
import { crearAdmin, crearCliente, crearProducto, enviarWebhook, eventoWompi, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Operación de pedidos: copia de la dirección, pasos después del pago,
// lo que ve el cliente y el listado del panel con filtros y páginas.
export async function probarPedidos() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const cliente = await crearCliente(creados, "pedidos_e2e");
    const admin = await crearAdmin(creados);
    const producto = await crearProducto(creados, "E2E Pedidos Producto", 10, 20000);
    const datosDireccion = {
      fullName: "Cliente Pedidos E2E",
      addressLine1: "Calle 10 # 20-30",
      city: "Medellín",
      state: "Antioquia",
      postalCode: "050001",
      phone: "3001234567",
    };
    const direccion = exigir(await req("POST", "/addresses", datosDireccion, cliente.token), "Dirección");
    const comprar = async () => {
      exigir(await req("POST", "/cart/items", { productId: producto.id, quantity: 1 }, cliente.token), "Agregar al carrito");
      return exigir(await req("POST", "/orders/checkout", { shippingAddressId: direccion.id }, cliente.token), "Checkout");
    };
    const pagar = async (pedido: { id: string; totalAmount: number }) => {
      const intento = exigir(await req("POST", `/payments/wompi/initiate/${pedido.id}`, undefined, cliente.token), "Iniciar pago");
      const evento = eventoWompi({ id: `e2e-pedidos-${pedido.id}`, reference: intento.reference, status: "APPROVED", amount_in_cents: pedido.totalAmount * 100 });
      exigir(await enviarWebhook(evento), "Webhook aprobado");
    };
    const paso = (id: string, accion: string, token = admin.token) => req("POST", `/orders/${id}/${accion}`, {}, token);

    console.log("[pedidos] La dirección se copia al pedido");
    const p1 = await comprar();
    exigir(await req("PUT", `/addresses/${direccion.id}`, { ...datosDireccion, addressLine1: "Carrera 99 # 1-1", city: "Bogotá" }, cliente.token), "Editar dirección");
    const visto = exigir(await req("GET", `/orders/${p1.id}`, undefined, cliente.token), "Ver pedido");
    verificar(
      visto.shippingAddress?.addressLine1 === "Calle 10 # 20-30" && visto.shippingAddress?.city === "Medellín",
      "editar la dirección después no cambia a dónde va el pedido"
    );
    const guardado = await prisma.order.findUniqueOrThrow({ where: { id: p1.id } });
    verificar(guardado.shippingFullName === "Cliente Pedidos E2E" && guardado.shippingPhone === "3001234567", "la copia queda guardada en el pedido");

    console.log("\n[pedidos] Pasos después del pago");
    verificar((await paso(p1.id, "process")).status === 409, "no se prepara un pedido sin pagar");
    await pagar(p1);
    verificar((await paso(p1.id, "deliver")).status === 409, "no se entrega un pedido que no se ha enviado");
    verificar((await paso(p1.id, "process", cliente.token)).status === 403, "solo el admin cambia el estado");
    verificar((await paso("no-existe", "process")).status === 404, "pedido inexistente → 404");
    const preparar = await paso(p1.id, "process");
    verificar(preparar.status === 200 && preparar.data.status === "PROCESSING", "el pagado pasa a en preparación");
    verificar((await paso(p1.id, "process")).status === 409, "prepararlo otra vez → 409");
    exigir(await req("POST", `/orders/${p1.id}/dispatch`, { carrier: "Envía", trackingNumber: "E2E-PED-1" }, admin.token), "Despachar");
    verificar((await req("POST", `/orders/${p1.id}/deliver`, { note: "x".repeat(201) }, admin.token)).status === 400, "la nota tiene tope de 200 caracteres");
    const entregar = await req("POST", `/orders/${p1.id}/deliver`, { note: "Recibió el portero" }, admin.token);
    verificar(entregar.status === 200 && entregar.data.status === "DELIVERED", "el enviado se marca como entregado");
    const logs = await prisma.orderStatusLog.findMany({ where: { orderId: p1.id }, orderBy: { changedAt: "asc" } });
    verificar(
      logs.some((l) => l.toStatus === "PROCESSING" && l.changedById === admin.id) &&
        logs.some((l) => l.toStatus === "DELIVERED" && l.reason === "Entregado al cliente: Recibió el portero"),
      "la bitácora registra quién preparó y entregó, con la nota"
    );

    console.log("\n[pedidos] Lo que ve el cliente");
    const final = exigir(await req("GET", `/orders/${p1.id}`, undefined, cliente.token), "Ver pedido entregado");
    const estados = (final.timeline as { status: string }[]).map((e) => e.status);
    verificar(
      JSON.stringify(estados) === JSON.stringify(["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"]),
      `la línea de tiempo muestra la creación y cada paso en orden (${estados.join(" → ")})`
    );
    const texto = JSON.stringify(final);
    verificar(!("statusLogs" in final) && !texto.includes("Recibió el portero") && !texto.includes(admin.id), "sin notas internas ni quién hizo cada cambio");
    const mios = exigir(await req("GET", "/orders/me", undefined, cliente.token), "Mis pedidos") as { id: string; timeline: unknown[] }[];
    verificar(mios.find((o) => o.id === p1.id)?.timeline.length === 5, "la lista de mis pedidos trae la misma línea de tiempo");

    console.log("\n[pedidos] Listado del panel");
    const p2 = await comprar();
    verificar((await req("GET", "/orders", undefined, cliente.token)).status === 403, "un cliente no ve el listado");
    verificar((await req("GET", "/orders?status=NADA", undefined, admin.token)).status === 400, "estado inválido → 400");
    verificar((await req("GET", "/orders?pageSize=500", undefined, admin.token)).status === 400, "máximo 100 por página");
    const porCorreo = exigir(await req("GET", `/orders?q=${encodeURIComponent(cliente.email.toUpperCase())}`, undefined, admin.token), "Buscar por correo");
    verificar(porCorreo.total === 2 && porCorreo.items[0].id === p2.id, "busca por correo (sin importar mayúsculas), los más nuevos primero");
    const pagina2 = exigir(await req("GET", `/orders?q=${encodeURIComponent(cliente.email)}&pageSize=1&page=2`, undefined, admin.token), "Página 2");
    verificar(pagina2.items.length === 1 && pagina2.items[0].id === p1.id && pagina2.page === 2 && pagina2.total === 2, "pagina de a un pedido");
    const entregados = exigir(await req("GET", `/orders?status=DELIVERED&q=${encodeURIComponent(cliente.email)}`, undefined, admin.token), "Filtrar entregados");
    verificar(entregados.total === 1 && entregados.items[0].id === p1.id, "filtra por estado");
    const porNumero = exigir(await req("GET", `/orders?q=${encodeURIComponent(`#${p2.id.slice(-8)}`)}`, undefined, admin.token), "Buscar por número");
    verificar(porNumero.items.some((o: { id: string }) => o.id === p2.id), "busca por el número corto que ve el cliente (#xxxxxxxx)");
    const porNombre = exigir(await req("GET", "/orders?q=cliente%20pedidos%20e2e", undefined, admin.token), "Buscar por nombre");
    verificar(porNombre.total === 2, "busca por el nombre de quien recibe");
    const item = porCorreo.items.find((o: { id: string }) => o.id === p1.id);
    verificar(item.shippingAddress?.city === "Medellín" && item.statusLogs.some((l: { changedBy: { email: string } | null }) => l.changedBy?.email), "el panel ve la dirección copiada y quién hizo cada cambio");
    verificar(porCorreo.counts.ALL >= 2 && porCorreo.counts.DELIVERED >= 1 && porCorreo.counts.PENDING >= 1 && "REVIEW" in porCorreo.counts, "trae los conteos de cada pestaña");
  } finally {
    await limpiar(creados);
  }
}
