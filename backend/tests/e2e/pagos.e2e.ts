import { prisma } from "../../src/lib/prisma";
import { expirePendingOrders } from "../../src/services/payments.service";
import {
  crearAdmin,
  crearCliente,
  crearProducto,
  enviarWebhook,
  eventoWompi,
  exigir,
  limpiar,
  req,
  verificar,
  type Creados,
} from "./_utilidades";

// Pagos con Wompi: reserva de inventario, intentos, webhook idempotente,
// rechazos, vencimiento, aprobaciones tardías, anulaciones y despacho.
export async function probarPagos() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const cliente = await crearCliente(creados, "pagos_e2e");
    const otro = await crearCliente(creados, "otro_e2e");
    const admin = await crearAdmin(creados);
    const producto = await crearProducto(creados, "E2E Pagos Producto", 5, 10000);
    const direccion = exigir(
      await req(
        "POST",
        "/addresses",
        { fullName: "Cliente E2E", addressLine1: "Calle 1 # 2-3", city: "Medellín", state: "Antioquia", postalCode: "050001", phone: "3001234567" },
        cliente.token
      ),
      "Dirección"
    );

    const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).stock;
    const pedido = (id: string) => prisma.order.findUniqueOrThrow({ where: { id }, include: { statusLogs: { orderBy: { changedAt: "asc" } }, payments: true } });
    const carrito = async () => (await req("GET", "/cart", undefined, cliente.token)).data.items as { productId: string; quantity: number }[];
    const comprar = async (cantidad: number) => {
      exigir(await req("POST", "/cart/items", { productId: producto.id, quantity: cantidad }, cliente.token), "Agregar al carrito");
      return exigir(await req("POST", "/orders/checkout", { shippingAddressId: direccion.id }, cliente.token), "Checkout");
    };
    const iniciar = (orderId: string) => req("POST", `/payments/wompi/initiate/${orderId}`, undefined, cliente.token);
    let transacciones = 0;
    const transaccion = (reference: string, status: string, amount: number, extra: Record<string, unknown> = {}) => ({
      id: `e2e-${Date.now()}-${++transacciones}`,
      reference,
      status,
      amount_in_cents: amount,
      ...extra,
    });

    console.log("[pagos] Reserva al confirmar el pedido");
    const p1 = await comprar(2);
    const minutos = (new Date(p1.expiresAt).getTime() - Date.now()) / 60_000;
    verificar(p1.status === "PENDING" && minutos > 55 && minutos <= 61, `el pedido queda pendiente con plazo para pagar (${Math.round(minutos)} min)`);
    verificar((await stock()) === 3 && (await carrito()).length === 0, "reserva 2 de 5 y vacía el carrito");
    verificar((await pedido(p1.id)).statusLogs[0]?.reason === "Pedido creado", "la bitácora registra la creación");

    console.log("\n[pagos] Intentos de pago");
    const [i1, i1b] = await Promise.all([iniciar(p1.id), iniciar(p1.id)]);
    verificar(i1.status === 200 && i1.data.reference === i1b.data.reference, "abrir el pago dos veces seguidas no crea dos intentos");
    verificar((await pedido(p1.id)).payments.length === 1, "un solo intento guardado");
    verificar((await req("POST", `/payments/wompi/initiate/${p1.id}`, undefined, otro.token)).status === 404, "otro cliente no puede pagar tu pedido");

    console.log("\n[pagos] Un rechazo no pierde la venta");
    const rechazo = eventoWompi(transaccion(i1.data.reference, "DECLINED", p1.totalAmount * 100));
    const r1 = await enviarWebhook(rechazo);
    let estado = await pedido(p1.id);
    verificar(r1.status === 200 && estado.status === "PENDING" && (await stock()) === 3, "tras un rechazo el pedido sigue pendiente y con su inventario");
    const r1b = await enviarWebhook(rechazo);
    verificar(r1b.data?.result === "duplicate" && (await stock()) === 3, "el mismo evento repetido no cambia nada");
    const i2 = exigir(await iniciar(p1.id), "Reintento");
    verificar(i2.reference !== i1.data.reference, "el cliente puede reintentar con un intento nuevo");

    console.log("\n[pagos] Aprobación");
    const aprobado = transaccion(i2.reference, "APPROVED", p1.totalAmount * 100, { payment_method_type: "NEQUI" });
    const r2 = await enviarWebhook(eventoWompi(aprobado));
    estado = await pedido(p1.id);
    verificar(r2.status === 200 && estado.status === "PAID" && (await stock()) === 3, "el pago aprobado marca el pedido pagado sin tocar de nuevo el inventario");
    verificar(estado.statusLogs.some((l) => l.toStatus === "PAID" && l.reason?.includes("Nequi")), "la bitácora dice cómo se pagó");
    await enviarWebhook(eventoWompi(aprobado));
    await enviarWebhook(eventoWompi({ ...aprobado, status: "PENDING" }));
    estado = await pedido(p1.id);
    verificar(estado.status === "PAID" && estado.statusLogs.filter((l) => l.toStatus === "PAID").length === 1, "reintentos y eventos viejos de Wompi no duplican ni deshacen el pago");
    verificar((await iniciar(p1.id)).status === 409, "un pedido pagado no se vuelve a cobrar");

    console.log("\n[pagos] Webhooks inválidos");
    const falso = eventoWompi(transaccion(i2.reference, "APPROVED", 1));
    falso.signature.checksum = "0".repeat(64);
    verificar((await enviarWebhook(falso)).status === 401, "firma inválida → 401");
    verificar((await enviarWebhook({ event: "transaction.updated" })).status === 401, "evento sin firma → 401");
    const desconocido = await enviarWebhook(eventoWompi(transaccion("REF-QUE-NO-EXISTE", "APPROVED", 100)));
    verificar(desconocido.status === 200 && desconocido.data?.result === "unknown-reference", "una referencia ajena se ignora sin que Wompi reintente");

    console.log("\n[pagos] Monto que no coincide y cancelación por el cliente");
    const p2 = await comprar(1);
    const i3 = exigir(await iniciar(p2.id), "Intento p2");
    await enviarWebhook(eventoWompi(transaccion(i3.reference, "APPROVED", 100)));
    estado = await pedido(p2.id);
    verificar(estado.status === "PENDING" && estado.needsReview && Boolean(estado.reviewNote?.includes("no se dio por pagado")), "un pago por otro monto no paga el pedido y queda para revisión");
    verificar((await req("POST", `/orders/${p2.id}/cancel`, undefined, otro.token)).status === 404, "otro cliente no puede cancelarlo");
    exigir(await req("POST", `/orders/${p2.id}/cancel`, undefined, cliente.token), "Cancelar p2");
    verificar((await pedido(p2.id)).status === "CANCELLED" && (await stock()) === 3, "el cliente cancela un pedido sin pagar y el inventario vuelve");
    verificar((await carrito()).some((i) => i.productId === producto.id && i.quantity === 1), "y el producto vuelve a su carrito");
    verificar((await req("POST", `/orders/${p1.id}/cancel`, undefined, cliente.token)).status === 409, "un pedido pagado no se cancela así");
    exigir(await req("DELETE", "/cart", undefined, cliente.token), "Vaciar carrito");

    console.log("\n[pagos] Vencimiento y aprobación tardía");
    const p3 = await comprar(1);
    const i4 = exigir(await iniciar(p3.id), "Intento p3");
    verificar((await stock()) === 2, "reserva 1 más");
    await prisma.order.update({ where: { id: p3.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await expirePendingOrders();
    verificar((await pedido(p3.id)).status === "CANCELLED" && (await stock()) === 3, "al vencer el plazo se cancela solo y libera el inventario");
    verificar((await carrito()).some((i) => i.productId === producto.id), "los productos vuelven al carrito");
    verificar((await iniciar(p3.id)).status === 409, "ya no se puede pagar");
    await enviarWebhook(eventoWompi(transaccion(i4.reference, "APPROVED", p3.totalAmount * 100, { payment_method_type: "PSE" })));
    estado = await pedido(p3.id);
    verificar(estado.status === "PAID" && (await stock()) === 2, "si el banco aprueba tarde, el pedido se reactiva y vuelve a reservar");
    verificar(estado.statusLogs.some((l) => l.reason?.includes("después de cancelado")), "y la bitácora lo explica");
    exigir(await req("DELETE", "/cart", undefined, cliente.token), "Vaciar carrito");

    console.log("\n[pagos] Pago duplicado y aprobación sin inventario");
    const duplicado = await prisma.payment.create({ data: { orderId: p3.id, status: "PENDING", paymentReference: `E2E-DUP-${Date.now()}` } });
    await enviarWebhook(eventoWompi(transaccion(duplicado.paymentReference, "APPROVED", p3.totalAmount * 100)));
    estado = await pedido(p3.id);
    verificar(estado.status === "PAID" && estado.needsReview && Boolean(estado.reviewNote?.includes("duplicado")), "un segundo pago aprobado queda marcado para reembolso");

    const p4 = await comprar(1);
    const i5 = exigir(await iniciar(p4.id), "Intento p4");
    await prisma.order.update({ where: { id: p4.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await expirePendingOrders();
    const stockAntes = await stock();
    await prisma.product.update({ where: { id: producto.id }, data: { stock: 0 } });
    await enviarWebhook(eventoWompi(transaccion(i5.reference, "APPROVED", p4.totalAmount * 100)));
    estado = await pedido(p4.id);
    verificar(estado.status === "CANCELLED" && estado.needsReview && Boolean(estado.reviewNote?.includes("reembolsar")), "aprobado tarde sin inventario: sigue cancelado y queda para reembolso");
    verificar((await stock()) === 0, "sin vender lo que no hay");
    await prisma.product.update({ where: { id: producto.id }, data: { stock: stockAntes } });
    exigir(await req("DELETE", "/cart", undefined, cliente.token), "Vaciar carrito");

    console.log("\n[pagos] Anulación de un pago");
    const stockAntesAnular = await stock();
    await enviarWebhook(eventoWompi({ ...aprobado, status: "VOIDED" }));
    estado = await pedido(p1.id);
    verificar(estado.status === "CANCELLED" && (await stock()) === stockAntesAnular + 2, "un pago anulado cancela el pedido no despachado y devuelve el inventario");

    console.log("\n[pagos] Despacho y revisión");
    const p5 = await comprar(1);
    verificar((await req("POST", `/orders/${p5.id}/dispatch`, { carrier: "Envía", trackingNumber: "123" }, admin.token)).status === 409, "no se despacha un pedido sin pagar");
    const despacho = await req("POST", `/orders/${p3.id}/dispatch`, { carrier: "Envía", trackingNumber: "E2E-123" }, admin.token);
    estado = await pedido(p3.id);
    verificar(despacho.status === 200 && estado.status === "SHIPPED" && estado.statusLogs.some((l) => l.toStatus === "SHIPPED" && l.changedById === admin.id), "el pagado se despacha y queda quién lo hizo");
    verificar((await req("POST", `/orders/${p3.id}/review-resolved`, { note: "ok" }, cliente.token)).status === 403, "solo el admin resuelve revisiones");
    exigir(await req("POST", `/orders/${p3.id}/review-resolved`, { note: "Reembolsado en Wompi" }, admin.token), "Resolver revisión");
    estado = await pedido(p3.id);
    verificar(!estado.needsReview && estado.statusLogs.some((l) => l.reason === "Revisión resuelta: Reembolsado en Wompi"), "la revisión resuelta queda en la bitácora");

    console.log("\n[pagos] Lo que ve el cliente");
    const sync = await req("POST", `/payments/wompi/sync/${p5.id}`, undefined, cliente.token);
    verificar(sync.status === 200 && sync.data.status === "PENDING" && "expiresAt" in sync.data, "la página de resultado consulta el estado del pedido");
    verificar((await req("POST", `/payments/wompi/sync/${p5.id}`, undefined, otro.token)).status === 404, "pero no el de otro cliente");
    const mios = (await req("GET", "/orders/me", undefined, cliente.token)).data as { payments: Record<string, unknown>[]; items: { discountLog: unknown }[] }[];
    const texto = JSON.stringify(mios);
    verificar(!texto.includes("rawResponse") && !texto.includes("createdBy"), "sin la respuesta cruda de Wompi ni el correo de quien creó descuentos");
  } finally {
    await limpiar(creados);
  }
}
