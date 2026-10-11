import { crearAdmin, crearCliente, crearProducto, enviarWebhook, eventoWompi, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Tablero de ventas: cuenta solo lo pagado, por día (hora de Colombia), con lo
// más vendido y lo que falta despachar.
export async function probarVentas() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const cliente = await crearCliente(creados, "ventas_e2e");
    const admin = await crearAdmin(creados);
    const producto = await crearProducto(creados, "E2E Ventas Producto", 100, 10000);
    const direccion = exigir(
      await req("POST", "/addresses", { fullName: "Cliente Ventas E2E", addressLine1: "Calle 1 # 2-3", city: "Medellín", state: "Antioquia", postalCode: "050001", phone: "3001234567" }, cliente.token),
      "Dirección"
    );
    const comprar = async (n: number) => {
      exigir(await req("POST", "/cart/items", { productId: producto.id, quantity: n }, cliente.token), "Carrito");
      return exigir(await req("POST", "/orders/checkout", { shippingAddressId: direccion.id }, cliente.token), "Checkout");
    };
    const resumen = async () => exigir(await req("GET", "/sales/summary?days=7", undefined, admin.token), "Resumen");
    const hoy = (r: { daily: { date: string; revenue: number; orders: number }[] }) => r.daily[r.daily.length - 1];

    console.log("[ventas] Acceso y periodo");
    verificar((await req("GET", "/sales/summary", undefined, cliente.token)).status === 403, "un cliente no ve las ventas");
    verificar((await req("GET", "/sales/summary?days=15", undefined, admin.token)).status === 400, "solo 7, 30 o 90 días");
    const antes = await resumen();
    verificar(antes.daily.length === 7 && antes.days === 7, "una entrada por día, también sin ventas");

    console.log("\n[ventas] Lo pagado cuenta, lo pendiente no");
    const pagado = await comprar(40);
    const intento = exigir(await req("POST", `/payments/wompi/initiate/${pagado.id}`, undefined, cliente.token), "Pago");
    exigir(await enviarWebhook(eventoWompi({ id: `e2e-ventas-${pagado.id}`, reference: intento.reference, status: "APPROVED", amount_in_cents: pagado.totalAmount * 100 })), "Webhook");
    await comprar(1);
    const despues = await resumen();
    verificar(despues.current.revenue - antes.current.revenue === pagado.totalAmount, "las ventas suben exactamente el total pagado");
    verificar(despues.current.orders - antes.current.orders === 1 && despues.current.units - antes.current.units === 40, "un pedido y 40 unidades más (el pendiente no cuenta)");
    verificar(hoy(despues).revenue - hoy(antes).revenue === pagado.totalAmount, "la venta queda en el día de hoy");
    const top = despues.topProducts.find((p: { id: string }) => p.id === producto.id);
    verificar(top?.units === 40 && top?.revenue === 400000, "aparece entre lo más vendido con sus unidades y su valor");
    verificar((despues.byStatus.PENDING ?? 0) - (antes.byStatus.PENDING ?? 0) === 1, "el pendiente sí aparece en los estados del periodo");
    verificar(despues.toShip - antes.toShip === 1, "el pagado queda por despachar");
    verificar(despues.current.avgTicket === Math.round(despues.current.revenue / despues.current.orders), "ticket promedio = ventas / pedidos");
  } finally {
    await limpiar(creados);
  }
}
