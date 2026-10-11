import { prisma } from "../../src/lib/prisma";
import { nitCheckDigit } from "../../src/lib/tax";
import { crearAdmin, crearCliente, crearProducto, exigir, limpiar, req, verificar, CLAVE_PRUEBA, type Creados } from "./_utilidades";

// Formalización: datos personales (Ley 1581), identificación del comerciante,
// IVA por producto y factura a nombre del cliente.
export async function probarPrivacidad() {
  const creados: Creados = { usuarios: [], productos: [] };
  const contactoAntes = await prisma.contactInfo.findUnique({ where: { id: "main" } });
  try {
    const admin = await crearAdmin(creados);
    const producto = await crearProducto(creados, "E2E Privacidad Producto", 10, 11900);

    console.log("[privacidad] Registro con autorización");
    const correo = `registro_priv_${Date.now()}@tienda.test`;
    const registrar = (extra: object) => req("POST", "/auth/register", { email: correo, phone: "3001234567", password: CLAVE_PRUEBA, ...extra });
    verificar((await registrar({})).status === 400, "sin autorizar el tratamiento no se crea la cuenta");
    const registro = exigir(await registrar({ acceptPrivacy: true, marketing: true }), "Registro");
    creados.usuarios.push(registro.user.id);
    const constancias = await prisma.consentRecord.findMany({ where: { userId: registro.user.id } });
    verificar(
      constancias.length === 2 && constancias.every((c) => c.granted && c.channel === "REGISTRO" && c.policyVersion) && constancias.some((c) => c.purpose === "MARKETING"),
      "queda constancia de la autorización y de las ofertas, con versión de la política"
    );
    const estado = exigir(await req("GET", "/privacy/me", undefined, registro.token), "Estado");
    verificar(estado.needsAcceptance === false && estado.marketingOptIn === true, "la cuenta nueva ya aceptó la versión vigente");

    console.log("\n[privacidad] Cuentas anteriores y ofertas");
    const antiguo = await crearCliente(creados, "priv_e2e");
    verificar(exigir(await req("GET", "/privacy/me", undefined, antiguo.token), "Estado antiguo").needsAcceptance === true, "a una cuenta anterior se le pide aceptar la política");
    exigir(await req("POST", "/privacy/accept", undefined, antiguo.token), "Aceptar");
    verificar(exigir(await req("GET", "/privacy/me", undefined, antiguo.token), "Estado").needsAcceptance === false, "al aceptarla queda al día");
    exigir(await req("PUT", "/privacy/marketing", { optIn: true }, antiguo.token), "Ofertas sí");
    exigir(await req("PUT", "/privacy/marketing", { optIn: false }, antiguo.token), "Ofertas no");
    const ofertas = await prisma.consentRecord.findMany({ where: { userId: antiguo.id, purpose: "MARKETING" }, orderBy: { createdAt: "asc" } });
    verificar(ofertas.length === 2 && ofertas[0].granted && !ofertas[1].granted, "autorizar y revocar las ofertas deja constancia de cada cambio");

    console.log("\n[privacidad] Comerciante, IVA y factura a nombre del cliente");
    const dvMalo = String((Number(nitCheckDigit("900123456")) + 1) % 10);
    verificar((await req("PUT", "/contact-info", { ...contactoBase(contactoAntes), nit: `900123456-${dvMalo}` }, admin.token)).status === 400, "un NIT con dígito de verificación equivocado se rechaza");
    const nit = `900123456-${nitCheckDigit("900123456")}`;
    exigir(await req("PUT", "/contact-info", { ...contactoBase(contactoAntes), legalName: "Comercio E2E S.A.S.", nit: `900.123.456-${nitCheckDigit("900123456")}` }, admin.token), "Contacto");
    const publico = exigir(await req("GET", "/contact-info"), "Contacto público");
    verificar(publico.legalName === "Comercio E2E S.A.S." && publico.nit === nit, "la razón social y el NIT quedan publicados (sin puntos)");
    exigir(await req("PUT", "/contact-info", { ...contactoBase(contactoAntes) }, admin.token), "Contacto sin datos legales");
    verificar((await prisma.contactInfo.findUniqueOrThrow({ where: { id: "main" } })).nit === nit, "guardar el contacto sin esos campos no los borra");
    verificar((await req("PUT", `/products/${producto.id}`, { taxRate: 7 }, admin.token)).status === 400, "solo tarifas de IVA válidas (0, 5, 19)");
    exigir(await req("PUT", `/products/${producto.id}`, { taxRate: 5 }, admin.token), "IVA 5");
    const direccion = exigir(
      await req("POST", "/addresses", { fullName: "Cliente Priv E2E", addressLine1: "Calle 1 # 2-3", city: "Pasto", state: "Nariño", postalCode: "520001", phone: "3001234567" }, antiguo.token),
      "Dirección"
    );
    exigir(await req("POST", "/cart/items", { productId: producto.id, quantity: 2 }, antiguo.token), "Carrito");
    const cotizacion = exigir(await req("POST", "/orders/quote", { shippingAddressId: direccion.id }, antiguo.token), "Cotizar");
    verificar(cotizacion.taxIncluded === Math.round(23800 - 23800 / 1.05), `la cotización muestra el IVA incluido (${cotizacion.taxIncluded})`);
    const comprar = (billing: object | null) => req("POST", "/orders/checkout", { shippingAddressId: direccion.id, billing }, antiguo.token);
    verificar((await comprar({ idType: "31", idNumber: `900123456-${dvMalo}`, name: "Empresa E2E" })).status === 400, "NIT con dígito equivocado en la factura → 400");
    const pedido = exigir(await comprar({ idType: "31", idNumber: nit, name: "Empresa E2E S.A.S." }), "Checkout con factura a nombre");
    const guardado = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } });
    verificar(guardado.billingIdType === "31" && guardado.billingIdNumber === "900123456" && guardado.billingName === "Empresa E2E S.A.S.", "la factura a nombre queda en el pedido (NIT sin dígito)");
    verificar(guardado.items[0].taxRate === 5, "cada línea guarda la tarifa de IVA con la que se vendió");

    console.log("\n[privacidad] Mis datos y supresión");
    const descarga = exigir(await req("GET", "/privacy/export", undefined, antiguo.token), "Descargar datos");
    const texto = JSON.stringify(descarga);
    verificar(descarga.account.email === antiguo.email && descarga.orders.length === 1 && descarga.addresses.length === 1 && !texto.includes("passwordHash"), "descarga sus datos (sin la contraseña)");
    verificar((await req("POST", "/privacy/delete-account", { confirm: "ELIMINAR", password: CLAVE_PRUEBA }, antiguo.token)).status === 409, "con un pedido en curso no se puede suprimir");
    exigir(await req("POST", `/orders/${pedido.id}/cancel`, undefined, antiguo.token), "Cancelar");
    verificar((await req("POST", "/privacy/delete-account", { confirm: "BORRAR", password: CLAVE_PRUEBA }, antiguo.token)).status === 400, "hay que escribir ELIMINAR");
    verificar((await req("POST", "/privacy/delete-account", { confirm: "ELIMINAR", password: "otra-clave" }, antiguo.token)).status === 401, "y poner la contraseña correcta");
    exigir(await req("POST", "/privacy/delete-account", { confirm: "ELIMINAR", password: CLAVE_PRUEBA }, antiguo.token), "Suprimir");
    const suprimido = await prisma.user.findUniqueOrThrow({ where: { id: antiguo.id } });
    verificar(suprimido.deletedAt !== null && suprimido.email.endsWith("@anonimo.invalid") && suprimido.phone === null && suprimido.passwordHash === null, "la cuenta queda anonimizada");
    verificar((await prisma.shippingAddress.count({ where: { userId: antiguo.id } })) === 0, "sus direcciones se borran");
    const conservado = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    verificar(conservado.shippingAddressId === null && conservado.shippingFullName === "Cliente Priv E2E", "el pedido conserva lo que la ley obliga a guardar");
    verificar((await req("GET", "/privacy/me", undefined, antiguo.token)).status === 401, "la sesión anterior deja de servir");
    verificar((await req("POST", "/auth/login", { email: antiguo.email, password: CLAVE_PRUEBA })).status === 401, "y ya no se puede ingresar");
    verificar(
      (await prisma.consentRecord.count({ where: { userId: antiguo.id, channel: "SUPRESION", granted: false } })) === 1,
      "queda constancia de la supresión"
    );
    const admin2 = await req("POST", "/privacy/delete-account", { confirm: "ELIMINAR", password: CLAVE_PRUEBA }, admin.token);
    verificar(admin2.status === 409, "una cuenta del equipo no se suprime así");

    console.log("\n[privacidad] Invitado");
    const invitado = (extra: object) =>
      req("POST", "/orders/guest-checkout", {
        email: `invitado_priv_${Date.now()}@tienda.test`,
        address: { fullName: "Invitado Priv", addressLine1: "Calle 2 # 3-4", city: "Pasto", state: "Nariño", postalCode: "520001", phone: "3001234567" },
        items: [{ productId: producto.id, quantity: 1 }],
        ...extra,
      });
    verificar((await invitado({})).status === 400, "el invitado también debe autorizar el tratamiento");
    const deInvitado = exigir(await invitado({ acceptPrivacy: true }), "Pedido de invitado");
    verificar((await prisma.consentRecord.count({ where: { orderId: deInvitado.id, channel: "CHECKOUT_INVITADO", granted: true } })) === 1, "y queda la constancia ligada a su pedido");
  } finally {
    if (contactoAntes) {
      const { id: _id, updatedAt: _u, ...data } = contactoAntes;
      await prisma.contactInfo.update({ where: { id: "main" }, data });
    }
    await limpiar(creados);
  }
}

// Los campos obligatorios del contacto, como estaban.
function contactoBase(c: { phone: string; whatsapp: string; email: string; address: string } | null) {
  return {
    phone: c?.phone ?? "+57 300 000 0000",
    whatsapp: c?.whatsapp ?? "+57 300 000 0000",
    email: c?.email ?? "contacto@tiendavirtual.test",
    address: c?.address ?? "Calle Falsa 123",
  };
}
