import { prisma } from "../../src/lib/prisma";
import { expirePendingOrders } from "../../src/services/payments.service";
import { crearAdmin, crearCliente, crearProducto, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Pago contra entrega: reglas de ciudad y tope, sin plazo para pagar,
// confirmación con el cliente, cobro al entregar y pedidos que no se concretan.
export async function probarContraEntrega() {
  const creados: Creados = { usuarios: [], productos: [] };
  const configuracionAntes = await prisma.storeSettings.findUnique({ where: { id: "main" } });
  try {
    const cliente = await crearCliente(creados, "cod_e2e");
    const admin = await crearAdmin(creados);
    const producto = await crearProducto(creados, "E2E Contra Entrega", 20, 50000);
    const caro = await crearProducto(creados, "E2E Contra Entrega Caro", 5, 900000);
    const direccion = async (city: string, postalCode = "050001") =>
      exigir(
        await req("POST", "/addresses", { fullName: "Cliente COD E2E", addressLine1: "Calle 1 # 2-3", city, state: "Antioquia", postalCode, phone: "3001234567" }, cliente.token),
        "Dirección"
      );
    const medellin = await direccion("Medellín");
    const pasto = await direccion("Pasto", "520001");
    const agregar = async (productId: string, quantity = 1) => exigir(await req("POST", "/cart/items", { productId, quantity }, cliente.token), "Carrito");
    const vaciar = () => req("DELETE", "/cart", undefined, cliente.token);
    const cotizar = (shippingAddressId: string) => req("POST", "/orders/quote", { shippingAddressId }, cliente.token);
    const comprar = (shippingAddressId: string, paymentOption = "CASH_ON_DELIVERY") => req("POST", "/orders/checkout", { shippingAddressId, paymentOption }, cliente.token);
    const configurar = (data: object) => req("PUT", "/settings/cash-on-delivery", data, admin.token);
    const stock = async () => (await prisma.product.findUniqueOrThrow({ where: { id: producto.id } })).stock;
    const paso = (id: string, ruta: string, body: object = {}) => req("POST", `/orders/${id}/${ruta}`, body, admin.token);

    console.log("[contra entrega] Configuración");
    verificar((await req("PUT", "/settings/cash-on-delivery", { codEnabled: true, codCities: ["Medellín"], codMaxAmount: 400000, codFee: 4000 }, cliente.token)).status === 403, "solo el admin cambia las reglas");
    verificar((await configurar({ codEnabled: true, codCities: [], codMaxAmount: 400000, codFee: 4000 })).status === 400, "activarlo exige al menos una ciudad");
    const guardada = exigir(await configurar({ codEnabled: true, codCities: ["medellin", "Medellín", "Bogotá"], codMaxAmount: 400000, codFee: 4000 }), "Configurar");
    verificar(guardada.codCities.length === 2, "ciudades sin repetir (sin importar tildes ni mayúsculas)");

    console.log("\n[contra entrega] Cotización");
    await agregar(producto.id, 2);
    const cotizacion = exigir(await cotizar(medellin.id), "Cotizar Medellín");
    verificar(cotizacion.subtotal === 100000 && cotizacion.shippingCost > 0 && cotizacion.total === 100000 + cotizacion.shippingCost, "la cotización muestra productos, envío y total antes de confirmar");
    verificar(cotizacion.cod.available && cotizacion.cod.fee === 4000, "contra entrega disponible en Medellín, con su recargo");
    const fuera = exigir(await cotizar(pasto.id), "Cotizar Pasto");
    verificar(!fuera.cod.available && fuera.cod.reason === "CITY", "no disponible en una ciudad fuera de la lista");
    verificar((await comprar(pasto.id)).status === 409, "y el checkout lo rechaza ahí");
    await agregar(caro.id, 1);
    const tope = exigir(await cotizar(medellin.id), "Cotizar con tope");
    verificar(!tope.cod.available && tope.cod.reason === "AMOUNT", "no disponible si el pedido pasa del tope");
    await vaciar();

    console.log("\n[contra entrega] Pedido");
    await agregar(producto.id, 2);
    const antes = await stock();
    const pedido = exigir(await comprar(medellin.id), "Checkout contra entrega");
    verificar(pedido.paymentOption === "CASH_ON_DELIVERY" && pedido.codFee === 4000 && pedido.totalAmount === cotizacion.total + 4000, "el total incluye el recargo");
    verificar(pedido.expiresAt === null && (await stock()) === antes - 2, "reserva el inventario y no tiene plazo para pagar");
    verificar((await req("POST", `/payments/wompi/initiate/${pedido.id}`, undefined, cliente.token)).status === 409, "no se puede pagar en línea");
    await prisma.order.update({ where: { id: pedido.id }, data: { createdAt: new Date(Date.now() - 3 * 60 * 60_000) } });
    await expirePendingOrders();
    verificar((await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } })).status === "PENDING", "no lo cancela el vencimiento automático");

    console.log("\n[contra entrega] Confirmar, despachar y entregar");
    const enPanel = exigir(await req("GET", `/orders?status=TO_CONFIRM&q=${encodeURIComponent(cliente.email)}`, undefined, admin.token), "Por confirmar");
    verificar(enPanel.total === 1 && enPanel.counts.TO_CONFIRM >= 1, "aparece en la pestaña por confirmar");
    verificar((await paso(pedido.id, "process")).status === 409, "no se 'prepara' como si estuviera pagado");
    verificar((await paso(pedido.id, "confirm")).status === 200, "el admin lo confirma con el cliente");
    verificar((await req("POST", `/orders/${pedido.id}/cancel`, undefined, cliente.token)).status === 409, "confirmado, el cliente ya no lo cancela");
    exigir(await paso(pedido.id, "dispatch", { carrier: "Envía", trackingNumber: "COD-1" }), "Despachar");
    exigir(await paso(pedido.id, "deliver"), "Entregar");
    const entregado = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id }, include: { payments: true } });
    verificar(
      entregado.status === "DELIVERED" && entregado.payments.length === 1 && entregado.payments[0].provider === "CASH" && entregado.payments[0].amountInCents === pedido.totalAmount * 100,
      "al entregarlo queda registrado el cobro en efectivo"
    );

    console.log("\n[contra entrega] Pedidos que no se concretan");
    await agregar(producto.id, 1);
    const rechazado = exigir(await comprar(medellin.id), "Segundo pedido");
    exigir(await paso(rechazado.id, "confirm"), "Confirmar");
    exigir(await paso(rechazado.id, "dispatch", { carrier: "Envía", trackingNumber: "COD-2" }), "Despachar");
    const antesDevolucion = await stock();
    verificar((await paso(rechazado.id, "cod-failed", { note: "x" })).status === 400, "exige explicar qué pasó");
    verificar((await paso(rechazado.id, "cod-failed", { note: "No recibió el pedido" })).status === 200, "el admin lo marca como no concretado");
    verificar((await stock()) === antesDevolucion + 1, "y el inventario vuelve");
    verificar((await paso(entregado.id, "cod-failed", { note: "No aplica" })).status === 409, "no aplica a uno ya entregado");
    await agregar(producto.id, 1);
    const enLinea = exigir(await comprar(medellin.id, "ONLINE"), "Pedido en línea");
    verificar(enLinea.paymentOption === "ONLINE" && enLinea.codFee === 0 && enLinea.expiresAt !== null, "en línea sigue igual: sin recargo y con plazo");
    verificar((await paso(enLinea.id, "cod-failed", { note: "No aplica" })).status === 409 && (await paso(enLinea.id, "confirm")).status === 409, "las acciones de contra entrega no aplican a pedidos en línea");

    console.log("\n[contra entrega] Desactivado");
    exigir(await configurar({ codEnabled: false, codCities: ["Medellín"], codMaxAmount: 400000, codFee: 0 }), "Desactivar");
    await agregar(producto.id, 1);
    const apagado = exigir(await cotizar(medellin.id), "Cotizar desactivado");
    verificar(!apagado.cod.available && apagado.cod.reason === "DISABLED" && (await comprar(medellin.id)).status === 409, "desactivado, no se ofrece ni se acepta");
  } finally {
    // La configuración de la tienda queda como estaba.
    if (configuracionAntes) {
      const { id: _id, updatedAt: _u, ...data } = configuracionAntes;
      await prisma.storeSettings.update({ where: { id: "main" }, data });
    } else {
      await prisma.storeSettings.deleteMany({ where: { id: "main" } });
    }
    await limpiar(creados);
  }
}
