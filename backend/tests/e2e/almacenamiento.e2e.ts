import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { filesRouter } from "../../src/routes/files.routes";
import { deleteUpload, detectFileType, publicImageUrl, saveUpload, signedPrivateUrl } from "../../src/services/storage";
import { verificar } from "./_utilidades";

// Un PNG mínimo válido (1×1).
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

// Servidor S3 simulado (lo mínimo de la API que usa storage.ts: subir, leer y
// borrar objetos con direcciones /bucket/clave).
function fakeS3() {
  const objects = new Map<string, { body: Buffer; type: string }>();
  const server = http.createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? "").split("?")[0]);
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (req.method === "PUT") {
        objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers["content-type"] ?? "") });
        res.writeHead(200, { ETag: '"e2e"' }).end();
      } else if (req.method === "GET") {
        const object = objects.get(key);
        if (!object) {
          res.writeHead(404, { "Content-Type": "application/xml" }).end("<Error><Code>NoSuchKey</Code><Message>No existe</Message></Error>");
          return;
        }
        res.writeHead(200, { "Content-Type": object.type, "Content-Length": object.body.length }).end(object.body);
      } else if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204).end();
      } else res.writeHead(405).end();
    });
  });
  return { objects, server };
}

const listen = (server: http.Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));

// Modo de almacenamiento en la nube (compatible con S3: Cloudflare R2, AWS
// S3) contra un servidor simulado.
export async function probarAlmacenamiento() {
  const s3 = fakeS3();
  const app = express().use("/files", filesRouter);
  const api = http.createServer(app);
  const [s3Port, apiPort] = [await listen(s3.server), await listen(api)];
  const before = { ...process.env };
  Object.assign(process.env, {
    STORAGE_DRIVER: "s3",
    S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
    S3_FORCE_PATH_STYLE: "true",
    S3_ACCESS_KEY_ID: "e2e",
    S3_SECRET_ACCESS_KEY: "e2e",
    S3_PUBLIC_BUCKET: "tienda-publico",
    S3_PRIVATE_BUCKET: "tienda-privado",
    PUBLIC_FILES_URL: "https://archivos.tienda.test",
    BACKEND_URL: `http://127.0.0.1:${apiPort}`,
  });
  try {
    const type = detectFileType(PNG)!;
    console.log("[almacenamiento] Imágenes públicas en el bucket");
    const imagen = await saveUpload("products", PNG, type);
    const guardada = s3.objects.get(`/tienda-publico${imagen}`);
    verificar(/^\/uploads\/products\/[\w-]+\.png$/.test(imagen) && guardada?.type === "image/png" && guardada.body.equals(PNG), "la imagen queda en el bucket público con su tipo");
    verificar(publicImageUrl(imagen) === `https://archivos.tienda.test${imagen}`, "y se muestra desde la dirección pública del bucket");

    console.log("\n[almacenamiento] Adjuntos privados");
    const adjunto = await saveUpload("pqrs", PNG, type);
    verificar(s3.objects.has(`/tienda-privado/${adjunto}`) && !s3.objects.has(`/tienda-publico/${adjunto}`), "el adjunto queda solo en el bucket privado");
    const enlace = signedPrivateUrl(adjunto)!;
    verificar(enlace.startsWith(`http://127.0.0.1:${apiPort}/files/`), "el enlace firmado apunta a la API, no al bucket");
    const descarga = await fetch(enlace);
    const cuerpo = Buffer.from(await descarga.arrayBuffer());
    verificar(descarga.status === 200 && descarga.headers.get("content-type") === "image/png" && cuerpo.equals(PNG), "la API lo entrega desde el bucket privado");
    verificar((await fetch(enlace.replace(/sig=[a-f0-9]{4}/, "sig=0000"))).status === 403, "con la firma alterada no se entrega");
    await deleteUpload(adjunto);
    verificar((await fetch(signedPrivateUrl(adjunto)!)).status === 404, "borrado del bucket, responde que ya no existe");
    await deleteUpload(imagen);
    verificar(s3.objects.size === 0, "no queda nada en los buckets");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
    s3.server.close();
    api.close();
  }
}
