import { prisma } from "../../src/lib/prisma";
import { crearCliente, crearProducto, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Carrito: solo productos a la venta, sin pasar del inventario ni del tope, y
// avisos cuando algo cambia mientras el producto espera en el carrito.
export async function probarCarrito() {
  const creados: Creados = { usuarios: [], productos: [] };
  try {
    const cliente = await crearCliente(creados, "carrito_e2e");
    const morral = await crearProducto(creados, "E2E Carrito Morral", 3);
    const gorra = await crearProducto(creados, "E2E Carrito Gorra", 5);
    const retirado = await crearProducto(creados, "E2E Carrito Retirado", 5);
    await prisma.product.update({ where: { id: retirado.id }, data: { isActive: false } });
    const direccion = exigir(
      await req("POST", "/addresses", { fullName: "Cliente Carrito E2E", addressLine1: "Calle 1 # 2-3", city: "Medellín", state: "Antioquia", postalCode: "050001", phone: "3001234567" }, cliente.token),
      "Dirección"
    );
    const agregar = (productId: string, quantity: number) => req("POST", "/cart/items", { productId, quantity }, cliente.token);
    const cambiar = (productId: string, quantity: number) => req("PUT", `/cart/items/${productId}`, { quantity }, cliente.token);
    const linea = async (productId: string) =>
      ((await req("GET", "/cart", undefined, cliente.token)).data.items as { productId: string; quantity: number; issue: string | null }[]).find((i) => i.productId === productId);
    const checkout = () => req("POST", "/orders/checkout", { shippingAddressId: direccion.id }, cliente.token);

    console.log("[carrito] Qué se puede agregar");
    verificar((await agregar("no-existe", 1)).status === 404, "producto inexistente → 404");
    verificar((await agregar(retirado.id, 1)).status === 404, "producto desactivado → 404");
    verificar((await agregar(morral.id, 100)).status === 400, "más de 99 unidades → 400");
    verificar((await agregar(morral.id, 2)).status === 201, "agrega 2 de 3 disponibles");
    const demas = await agregar(morral.id, 2);
    verificar(demas.status === 409 && String(demas.data?.error).includes("ya tienes 2"), "no deja pasar del inventario y dice cuántos ya tienes");

    console.log("\n[carrito] Cambiar y quitar");
    verificar((await cambiar(morral.id, 3)).status === 200, "sube a 3 (todo lo disponible)");
    verificar((await cambiar(morral.id, 4)).status === 409, "no sube de lo disponible");
    verificar((await cambiar(gorra.id, 1)).status === 404, "cambiar algo que no está en el carrito → 404 (antes 500)");
    verificar((await req("DELETE", `/cart/items/${gorra.id}`, undefined, cliente.token)).status === 404, "quitar algo que no está → 404 (antes 500)");

    console.log("\n[carrito] Cambios mientras espera en el carrito");
    await prisma.product.update({ where: { id: morral.id }, data: { stock: 1 } });
    verificar((await linea(morral.id))?.issue === "NOT_ENOUGH_STOCK", "si bajan las existencias, la línea lo avisa");
    verificar((await cambiar(morral.id, 2)).status === 200, "bajar la cantidad siempre se puede");
    exigir(await agregar(gorra.id, 1), "Agregar gorra");
    await prisma.product.update({ where: { id: gorra.id }, data: { isActive: false } });
    verificar((await linea(gorra.id))?.issue === "INACTIVE", "si desactivan el producto, la línea lo avisa");
    verificar((await cambiar(gorra.id, 2)).status === 404, "no se sube la cantidad de un producto desactivado");
    verificar((await req("GET", `/products/${gorra.id}`)).status === 404, "el detalle público de un producto desactivado → 404");
    verificar((await req("GET", `/products/${morral.id}`)).status === 200, "el de uno activo sí se ve");

    console.log("\n[carrito] Confirmar el pedido");
    const conRetirado = await checkout();
    verificar(conRetirado.status === 409 && String(conRetirado.data?.error).includes("ya no está disponible"), "no confirma con un producto desactivado");
    verificar((await req("DELETE", `/cart/items/${gorra.id}`, undefined, cliente.token)).status === 204, "quita el desactivado");
    verificar((await checkout()).status === 409, "ni con más unidades de las que hay");
    exigir(await cambiar(morral.id, 1), "Ajustar a lo disponible");
    verificar((await linea(morral.id))?.issue === null, "ajustada, la línea queda sin avisos");
    verificar((await checkout()).status === 201, "con todo disponible, confirma");
    const agotado = await agregar(morral.id, 1);
    verificar(agotado.status === 409 && String(agotado.data?.error).includes("agotado"), "un producto agotado no se agrega");
  } finally {
    await limpiar(creados);
  }
}
