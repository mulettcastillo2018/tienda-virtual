import { prisma } from "../../src/lib/prisma";
import { crearAdmin, crearCliente, crearProducto, enviarWebhook, eventoWompi, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Reseñas de producto: solo compradores que recibieron el producto, una por
// cliente, respuesta pública de la tienda y moderación con motivo.
export async function probarResenas() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const admin = await crearAdmin(creados);
    const comprador = await crearCliente(creados, "resena_e2e");
    const otro = await crearCliente(creados, "resena_otro_e2e");
    const producto = await crearProducto(creados, "E2E Reseñas Producto", 20, 50000);
    const direccion = exigir(
      await req("POST", "/addresses", { fullName: "Cliente Reseña E2E", addressLine1: "Calle 1 # 2-3", city: "Pasto", state: "Nariño", postalCode: "520001", phone: "3001234567" }, comprador.token),
      "Dirección"
    );
    exigir(await req("POST", "/cart/items", { productId: producto.id, quantity: 1 }, comprador.token), "Carrito");
    const pedido = exigir(await req("POST", "/orders/checkout", { shippingAddressId: direccion.id }, comprador.token), "Checkout");
    const intento = exigir(await req("POST", `/payments/wompi/initiate/${pedido.id}`, undefined, comprador.token), "Pago");
    exigir(await enviarWebhook(eventoWompi({ id: `e2e-resena-${pedido.id}`, reference: intento.reference, status: "APPROVED", amount_in_cents: pedido.totalAmount * 100 })), "Webhook");
    const opinar = (token: string, body: object) => req("PUT", `/product-reviews/${producto.id}`, body, token);
    const publico = async () => exigir(await req("GET", `/product-reviews/${producto.id}`), "Reseñas públicas");

    console.log("[reseñas] Quién puede opinar");
    verificar((await opinar(comprador.token, { rating: 5, comment: "Excelente" })).status === 403, "pagado pero sin entregar todavía no puede opinar");
    verificar(exigir(await req("GET", `/product-reviews/${producto.id}/mine`, undefined, comprador.token), "Mía").canReview === false, "y la ficha no le ofrece el formulario");
    exigir(await req("POST", `/orders/${pedido.id}/dispatch`, { carrier: "Envía", trackingNumber: "RES-1" }, admin.token), "Despachar");
    exigir(await req("POST", `/orders/${pedido.id}/deliver`, {}, admin.token), "Entregar");
    verificar(exigir(await req("GET", `/product-reviews/${producto.id}/mine`, undefined, comprador.token), "Mía").canReview === true, "entregado: puede opinar");
    verificar((await opinar(otro.token, { rating: 1, comment: "Malo" })).status === 403, "quien no lo compró no puede opinar");
    verificar((await opinar(comprador.token, { rating: 6, comment: "Fuera de rango" })).status === 400, "de 1 a 5 estrellas");
    verificar((await opinar(comprador.token, { rating: 2, comment: "Llegó bien pero la tela es delgada" })).status === 201, "el comprador publica su reseña");
    const editada = await opinar(comprador.token, { rating: 4, comment: "Lo usé una semana: cumple, aunque la tela es delgada" });
    verificar(editada.status === 200 && (await prisma.productReview.count({ where: { productId: producto.id } })) === 1, "editarla no crea otra (una por cliente)");

    console.log("\n[reseñas] Lo que se publica");
    let lista = await publico();
    verificar(lista.total === 1 && lista.items[0].rating === 4 && /^re\*+@tienda\.test$/.test(lista.items[0].author), "se ve la reseña con el correo enmascarado");
    verificar(lista.summary.average === 4 && lista.summary.count === 1 && lista.summary.distribution["4"] === 1, "con el promedio y la distribución de estrellas");
    const ficha = exigir(await req("GET", `/products/${producto.id}`), "Ficha");
    const catalogo = exigir(await req("GET", `/products?search=${encodeURIComponent("E2E Reseñas")}`), "Catálogo");
    verificar(ficha.ratingAverage === 4 && ficha.ratingCount === 1 && catalogo.items[0]?.ratingCount === 1, "la ficha y el catálogo muestran el promedio");

    console.log("\n[reseñas] Respuesta y moderación");
    const resena = await prisma.productReview.findFirstOrThrow({ where: { productId: producto.id } });
    verificar((await req("POST", `/product-reviews/admin/${resena.id}/reply`, { reply: "Gracias" }, comprador.token)).status === 403, "solo la tienda responde");
    exigir(await req("POST", `/product-reviews/admin/${resena.id}/reply`, { reply: "Gracias por contarnos; mejoramos la tela en el próximo lote." }, admin.token), "Responder");
    lista = await publico();
    verificar(lista.items[0].storeReply?.startsWith("Gracias por contarnos") === true, "la respuesta de la tienda es pública");
    const panel = exigir(await req("GET", "/product-reviews?filter=UNANSWERED&pageSize=100", undefined, admin.token), "Panel");
    verificar(!panel.items.some((r: { id: string }) => r.id === resena.id), "respondida, sale de la pestaña sin responder");
    verificar((await req("POST", `/product-reviews/admin/${resena.id}/hide`, { reason: "no" }, admin.token)).status === 400, "ocultar exige el motivo");
    exigir(await req("POST", `/product-reviews/admin/${resena.id}/hide`, { reason: "Incluye un número de teléfono personal" }, admin.token), "Ocultar");
    lista = await publico();
    verificar(lista.total === 0 && lista.summary.count === 0 && exigir(await req("GET", `/products/${producto.id}`), "Ficha").ratingCount === 0, "oculta no se ve ni cuenta en el promedio");
    const mia = exigir(await req("GET", `/product-reviews/${producto.id}/mine`, undefined, comprador.token), "Mía");
    verificar(mia.review?.hiddenReason === "Incluye un número de teléfono personal", "el autor ve por qué se ocultó");
    exigir(await req("POST", `/product-reviews/admin/${resena.id}/unhide`, {}, admin.token), "Mostrar");
    verificar((await publico()).total === 1, "la tienda puede volver a mostrarla");

    console.log("\n[reseñas] El autor la borra");
    verificar((await req("DELETE", `/product-reviews/${producto.id}`, undefined, otro.token)).status === 404, "nadie borra la reseña de otro");
    verificar((await req("DELETE", `/product-reviews/${producto.id}`, undefined, comprador.token)).status === 204 && (await publico()).total === 0, "el autor puede borrar la suya");
  } finally {
    await limpiar(creados);
  }
}
