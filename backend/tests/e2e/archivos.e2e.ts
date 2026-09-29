import { prisma } from "../../src/lib/prisma";
import { deleteUpload } from "../../src/services/storage";
import { API_URL, crearAdmin, crearCliente, exigir, limpiar, req, verificar, type Creados, type Respuesta } from "./_utilidades";

// Un PNG mínimo válido (1×1) y un HTML disfrazado de imagen.
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
const HTML = Buffer.from("<html><script>alert(document.cookie)</script></html>");

async function subir(ruta: string, contenido: Buffer, nombre: string, tipo: string, token: string): Promise<Respuesta> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(contenido)], { type: tipo }), nombre);
  const res = await fetch(`${API_URL}${ruta}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Archivos: tipo real, adjuntos privados con enlaces firmados, imágenes sin
// dominio fijo.
export async function probarArchivos() {
  const creados: Creados = { usuarios: [], productos: [] };
  const subidos: string[] = [];
  const pqrsCreadas: string[] = [];
  try {
    const cliente = await crearCliente(creados, "archivos_e2e");
    const otro = await crearCliente(creados, "otro_archivos_e2e");
    const admin = await crearAdmin(creados);

    console.log("[archivos] Tipo real del archivo");
    const disfrazado = await subir("/uploads/pqrs-attachment", HTML, "foto.png", "image/png", cliente.token);
    verificar(disfrazado.status === 400, "un HTML que dice ser PNG se rechaza");
    const renombrado = await subir("/uploads/pqrs-attachment", PNG, "pagina.html", "text/html", cliente.token);
    if (renombrado.data?.key) subidos.push(renombrado.data.key);
    verificar(renombrado.status === 201 && /^pqrs\/[\w-]+\.png$/.test(renombrado.data.key), `una imagen real se guarda con su extensión verdadera (${renombrado.data?.key})`);
    verificar((await subir("/uploads/product-image", PNG, "x.png", "image/png", cliente.token)).status === 403, "un cliente no sube imágenes de productos");

    console.log("\n[archivos] Adjuntos privados");
    const nombre = renombrado.data.key.split("/")[1];
    verificar((await fetch(`${API_URL}/uploads/pqrs/${nombre}`)).status === 404, "el adjunto no está en la carpeta pública");
    const firmado = await fetch(renombrado.data.url);
    verificar(firmado.status === 200 && firmado.headers.get("content-security-policy")?.includes("sandbox"), "se ve con el enlace firmado, como contenido inerte");
    const alterado = renombrado.data.url.replace(/sig=[a-f0-9]{4}/, "sig=0000");
    verificar((await fetch(alterado)).status === 403, "un enlace con la firma alterada no sirve");
    const vencido = new URL(renombrado.data.url);
    vencido.searchParams.set("exp", String(Math.floor(Date.now() / 1000) - 10));
    verificar((await fetch(vencido)).status === 403, "ni uno vencido (o con la fecha cambiada)");

    console.log("\n[archivos] PQRS con adjunto");
    const ajeno = await req("POST", "/pqrs", { type: "QUEJA", subject: "E2E ajeno", message: "prueba", attachmentKey: renombrado.data.key }, otro.token);
    verificar(ajeno.status === 400, "no se puede adjuntar un archivo que subió otra persona");
    verificar((await req("POST", "/pqrs", { type: "QUEJA", subject: "E2E", message: "prueba", attachmentKey: "pqrs/../../.env" }, cliente.token)).status === 400, "ni una clave inventada");
    const creada = await req("POST", "/pqrs", { type: "QUEJA", subject: "E2E adjunto", message: "prueba", attachmentKey: renombrado.data.key }, cliente.token);
    if (creada.data?.id) pqrsCreadas.push(creada.data.id);
    verificar(creada.status === 201 && (await fetch(creada.data.attachmentUrl)).status === 200, "la solicitud queda con su adjunto y el cliente lo ve");
    const guardada = await prisma.pqrs.findUniqueOrThrow({ where: { id: creada.data.id } });
    verificar(guardada.attachmentUrl === renombrado.data.key, "en la base queda la clave, no una dirección");

    const juridico = await crearCliente(creados, "juridico_archivos_e2e");
    await prisma.user.update({ where: { id: juridico.id }, data: { role: "JURIDICO", tokenVersion: { increment: 1 } } });
    const tJuridico = exigir(await req("POST", "/auth/login", { email: juridico.email, password: "29bc41aa" }), "Login jurídico").token as string;
    exigir(await req("PUT", `/pqrs/${creada.data.id}`, { status: "EN_PROCESO", comment: "Nota interna E2E: revisar con bodega" }, tJuridico), "Responder");
    const delCliente = (await req("GET", "/pqrs/me", undefined, cliente.token)).data as Record<string, unknown>[];
    const texto = JSON.stringify(delCliente);
    verificar(!texto.includes("Nota interna") && !texto.includes(juridico.email), "el cliente no recibe comentarios internos ni correos del equipo");
    const delEquipo = JSON.stringify((await req("GET", "/pqrs", undefined, tJuridico)).data);
    verificar(delEquipo.includes("Nota interna"), "el equipo jurídico sí los ve");

    console.log("\n[archivos] Imágenes de productos sin dominio fijo");
    const imagen = await subir("/uploads/product-image", PNG, "foto.png", "image/png", admin.token);
    if (imagen.data?.key) subidos.push(imagen.data.key);
    verificar(imagen.status === 201 && imagen.data.url.startsWith("http") && imagen.data.key.startsWith("/uploads/products/"), "la subida devuelve la dirección para mostrarla y la ruta relativa");
    const categoria = await prisma.category.findFirstOrThrow();
    const base = { name: "E2E Archivos", description: "prueba", price: 1000, stock: 1, categoryId: categoria.id, weightInGrams: 100, widthCm: 1, heightCm: 1, depthCm: 1, sku: `E2E-ARCH-${Date.now()}` };
    const externa = "https://images.unsplash.com/photo-e2e";
    const producto = await req("POST", "/products", { ...base, images: [imagen.data.url, externa, externa, externa] }, admin.token);
    if (producto.data?.id) creados.productos.push(producto.data.id);
    const enBase = producto.data?.id ? await prisma.product.findUniqueOrThrow({ where: { id: producto.data.id } }) : null;
    verificar(enBase?.images[0] === imagen.data.key && enBase?.images[1] === externa, "se guarda la ruta relativa (las externas https pasan tal cual)");
    verificar(producto.data?.images?.[0] === imagen.data.url, "y la API la entrega completa");
    const peligrosas = ["javascript:alert(1)", "data:image/png;base64,AAAA", "http://otro-sitio.com/x.png", "/uploads/../../.env"];
    for (const mala of peligrosas) {
      const r = await req("POST", "/products", { ...base, sku: `${base.sku}-${mala.length}`, images: [mala, externa, externa, externa] }, admin.token);
      verificar(r.status === 400, `se rechaza una imagen "${mala}"`);
    }
  } finally {
    await prisma.pqrsStatusLog.deleteMany({ where: { pqrsId: { in: pqrsCreadas } } });
    await prisma.pqrs.deleteMany({ where: { id: { in: pqrsCreadas } } });
    for (const key of subidos) await deleteUpload(key);
    await prisma.uploadedFile.deleteMany({ where: { OR: [{ key: { in: subidos } }, { ownerId: { in: creados.usuarios } }] } });
    await limpiar(creados);
  }
}
