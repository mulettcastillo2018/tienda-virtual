import { prisma } from "../../src/lib/prisma";
import { nitCheckDigit } from "../../src/lib/tax";
import { iniciarAlanubeFalso, TOKEN_PRUEBA } from "./_alanubeFalso";
import { crearAdmin, crearCliente, crearProducto, enviarWebhook, eventoWompi, exigir, limpiar, req, verificar, type Creados } from "./_utilidades";

// Factura electrónica contra un Alanube simulado (sin credenciales reales):
// numeración, contenido con el IVA de cada producto, respuesta de la DIAN y
// nota crédito al reembolsar.
export async function probarFacturacion() {
  const creados: Creados = { usuarios: [], productos: [] };
  const fiscalAntes = await prisma.fiscalSettings.findUnique({ where: { id: "main" } });
  const contactoAntes = await prisma.contactInfo.findUnique({ where: { id: "main" } });
  const tiendaAntes = await prisma.storeSettings.findUnique({ where: { id: "main" } });
  const alanube = await iniciarAlanubeFalso(4099);
  try {
    const admin = await crearAdmin(creados);
    const cliente = await crearCliente(creados, "fact_e2e");
    const general = await crearProducto(creados, "E2E Factura IVA 19", 20, 119000);
    const reducido = await crearProducto(creados, "E2E Factura IVA 5", 20, 10500);
    await prisma.product.update({ where: { id: reducido.id }, data: { taxRate: 5 } });
    const direccion = exigir(
      await req("POST", "/addresses", { fullName: "Cliente Fact E2E", addressLine1: "Calle 1 # 2-3", city: "Pasto", state: "Nariño", postalCode: "520001", phone: "3001234567" }, cliente.token),
      "Dirección"
    );
    const procesar = async () => {
      // Los reintentos esperan unos segundos: aquí se adelantan.
      await prisma.fiscalDocument.updateMany({ where: { status: { in: ["PENDING", "SENT"] } }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      return exigir(await req("POST", "/fiscal/process", undefined, admin.token), "Procesar");
    };
    const documentos = (orderId: string) => prisma.fiscalDocument.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
    const prefijo = `E${Date.now().toString().slice(-6)}`;

    console.log("[facturación] Configuración");
    verificar((await req("GET", "/fiscal/settings", undefined, cliente.token)).status === 403, "solo el admin ve la facturación");
    verificar(
      (await req("PUT", "/fiscal/settings", { ...base(prefijo), alanubeUrl: "https://otro-servidor.com/api" }, admin.token)).status === 400,
      "el token solo viaja a la API de Alegra (o a una local en desarrollo)"
    );
    await prisma.contactInfo.update({ where: { id: "main" }, data: { legalName: "Comercio E2E S.A.S.", nit: `900123456-${nitCheckDigit("900123456")}` } });
    const config = exigir(await req("PUT", "/fiscal/settings", { ...base(prefijo), alanubeToken: TOKEN_PRUEBA }, admin.token), "Configurar");
    verificar(config.hasToken && config.missing.length === 0 && !("alanubeToken" in config), "queda lista, y el token no vuelve al navegador");

    console.log("\n[facturación] Factura de una venta");
    exigir(await req("POST", "/cart/items", { productId: general.id, quantity: 1 }, cliente.token), "Carrito 19");
    exigir(await req("POST", "/cart/items", { productId: reducido.id, quantity: 2 }, cliente.token), "Carrito 5");
    const nit = `901234567-${nitCheckDigit("901234567")}`;
    const pedido = exigir(
      await req("POST", "/orders/checkout", { shippingAddressId: direccion.id, billing: { idType: "31", idNumber: nit, name: "Empresa Cliente E2E" } }, cliente.token),
      "Checkout"
    );
    await procesar();
    verificar((await documentos(pedido.id)).length === 0, "un pedido sin pagar no se factura");
    const intento = exigir(await req("POST", `/payments/wompi/initiate/${pedido.id}`, undefined, cliente.token), "Pago");
    exigir(await enviarWebhook(eventoWompi({ id: `e2e-fact-${pedido.id}`, reference: intento.reference, status: "APPROVED", amount_in_cents: pedido.totalAmount * 100, payment_method_type: "PSE" })), "Webhook");
    await procesar();
    let [factura] = await documentos(pedido.id);
    verificar(factura?.type === "INVOICE" && factura.prefix === prefijo && factura.number === 1 && factura.status === "SENT", "pagado: se emite la factura con el primer número de la resolución");
    const enviada = alanube.recibidos.find((r) => r.ruta === "/invoices" && r.cuerpo.number === 1 && r.cuerpo.resolution?.prefix === prefijo)?.cuerpo;
    const impuestos = (enviada?.items ?? []).map((i: { taxes: { taxPercentage: string }[] }) => i.taxes[0]?.taxPercentage ?? "excluido");
    verificar(JSON.stringify(impuestos) === JSON.stringify(["19.00", "5.00", "excluido"]), `cada línea con su IVA; el envío excluido (${impuestos.join(", ")})`);
    verificar(
      enviada?.customer?.identificationType === "31" && enviada.customer.identificationNumber === "901234567" && enviada.customer.dv === nitCheckDigit("901234567"),
      "a nombre de la empresa, con el NIT y su dígito de verificación"
    );
    verificar(enviada?.payments?.[0]?.paymentMethod === "47" && Math.abs(enviada.totalAmounts.payableTotal - pedido.totalAmount) < 1, "medio de pago PSE y total que cuadra con lo cobrado");
    await procesar();
    [factura] = await documentos(pedido.id);
    verificar(factura.status === "ACCEPTED" && Boolean(factura.uniqueCode) && Boolean(factura.qr), "la DIAN la acepta: queda el CUFE y el QR");
    const visto = exigir(await req("GET", `/orders/${pedido.id}`, undefined, cliente.token), "Ver pedido");
    verificar(visto.invoices?.[0]?.fullNumber === `${prefijo}1`, "el cliente ve su factura en el pedido");
    await procesar();
    verificar((await documentos(pedido.id)).length === 1 && alanube.recibidos.filter((r) => r.ruta === "/invoices").length === 1, "no se factura dos veces");

    console.log("\n[facturación] Nota crédito al reembolsar");
    exigir(await req("POST", `/orders/${pedido.id}/dispatch`, { carrier: "Envía", trackingNumber: "FACT-1" }, admin.token), "Despachar");
    exigir(await req("POST", `/orders/${pedido.id}/deliver`, {}, admin.token), "Entregar");
    const retracto = exigir(await req("POST", "/returns", { orderId: pedido.id, type: "RETRACTO" }, cliente.token), "Retracto");
    exigir(await req("POST", `/returns/${retracto.id}/approve`, {}, admin.token), "Aprobar");
    exigir(await req("POST", `/returns/${retracto.id}/refund`, { reference: "REEMBOLSO-FACT" }, admin.token), "Reembolsar");
    await procesar();
    await procesar();
    const nota = (await documentos(pedido.id)).find((d) => d.type === "CREDIT_NOTE");
    const notaEnviada = alanube.recibidos.find((r) => r.ruta === "/credit-notes")?.cuerpo;
    verificar(nota?.status === "ACCEPTED" && nota.cancelsId === factura.id && nota.prefix === "NC", "el reembolso anula la factura con una nota crédito aceptada");
    verificar(notaEnviada?.creditNoteReference?.id === factura.alanubeId && notaEnviada?.note?.[0] === "Retracto del consumidor", "la nota apunta a la factura y dice el motivo");

    console.log("\n[facturación] Contra entrega y desactivada");
    await prisma.storeSettings.update({ where: { id: "main" }, data: { codEnabled: true, codCities: ["Pasto"], codMaxAmount: 1_000_000 } });
    exigir(await req("POST", "/cart/items", { productId: general.id, quantity: 1 }, cliente.token), "Carrito COD");
    const cod = exigir(await req("POST", "/orders/checkout", { shippingAddressId: direccion.id, paymentOption: "CASH_ON_DELIVERY" }, cliente.token), "COD");
    exigir(await req("POST", `/orders/${cod.id}/confirm`, {}, admin.token), "Confirmar");
    await procesar();
    verificar((await documentos(cod.id)).length === 0, "contra entrega no se factura antes de cobrarlo");
    exigir(await req("POST", `/orders/${cod.id}/dispatch`, { carrier: "Envía", trackingNumber: "FACT-2" }, admin.token), "Despachar COD");
    exigir(await req("POST", `/orders/${cod.id}/deliver`, {}, admin.token), "Entregar COD");
    await procesar();
    const [codFactura] = await documentos(cod.id);
    const codEnviada = alanube.recibidos.find((r) => r.ruta === "/invoices" && r.cuerpo.number === codFactura?.number && r.cuerpo.resolution?.prefix === prefijo)?.cuerpo;
    verificar(codFactura?.number === 2 && codEnviada?.payments?.[0]?.paymentMethod === "10" && codEnviada.customer.identificationNumber === "222222222222", "entregado: factura a consumidor final, pagada en efectivo");
    exigir(await req("PUT", "/fiscal/settings", { ...base(prefijo), enabled: false }, admin.token), "Desactivar");
    exigir(await req("POST", "/cart/items", { productId: general.id, quantity: 1 }, cliente.token), "Carrito 3");
    const sinFactura = exigir(await req("POST", "/orders/checkout", { shippingAddressId: direccion.id }, cliente.token), "Checkout 3");
    const intento3 = exigir(await req("POST", `/payments/wompi/initiate/${sinFactura.id}`, undefined, cliente.token), "Pago 3");
    exigir(await enviarWebhook(eventoWompi({ id: `e2e-fact-3-${sinFactura.id}`, reference: intento3.reference, status: "APPROVED", amount_in_cents: sinFactura.totalAmount * 100 })), "Webhook 3");
    await procesar();
    verificar((await documentos(sinFactura.id)).length === 0, "desactivada, no se emite nada");
  } finally {
    await alanube.cerrar();
    if (fiscalAntes) {
      const { id: _id, updatedAt: _u, ...data } = fiscalAntes;
      await prisma.fiscalSettings.update({ where: { id: "main" }, data });
    }
    if (contactoAntes) await prisma.contactInfo.update({ where: { id: "main" }, data: { legalName: contactoAntes.legalName, nit: contactoAntes.nit } });
    if (tiendaAntes) {
      const { id: _id, updatedAt: _u, ...data } = tiendaAntes;
      await prisma.storeSettings.update({ where: { id: "main" }, data });
    }
    await limpiar(creados);
  }
}

// Configuración completa apuntando al Alanube simulado.
function base(prefix: string) {
  return {
    enabled: true,
    alanubeUrl: "http://localhost:4099",
    alanubeCompanyId: "compania-e2e",
    resolutionNumber: "18760000001",
    prefix,
    rangeFrom: 1,
    rangeTo: 5000,
    startDate: "2026-01-01",
    endDate: "2030-12-31",
    technicalKey: "fc8eac422eba16e22ffd8c6f94b3f40a6e38162c",
    nextNumber: null,
    creditNotePrefix: "NC",
    creditNoteNext: 1,
    shippingTaxRate: 0,
  };
}
