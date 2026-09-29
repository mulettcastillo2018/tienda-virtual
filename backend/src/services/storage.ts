import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import type { Response } from "express";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Todo lo que tiene que ver con dónde viven los archivos subidos está aquí.
// Dos modos (STORAGE_DRIVER):
// - "local" (por defecto): en el disco del servidor.
// - "s3": en un almacenamiento compatible con S3 (Cloudflare R2, AWS S3...),
//   con un bucket público para las imágenes de productos y uno privado para
//   los adjuntos de PQRS. Necesario en hostings cuyo disco se borra en cada
//   despliegue.
//
// - Imágenes de productos: públicas. En la base se guarda la ruta relativa
//   (/uploads/products/<archivo>), no la dirección completa, para que cambiar
//   de dominio no rompa ninguna imagen; la API la completa al responder.
// - Adjuntos de PQRS: privados (fotos y videos de reclamos, datos personales).
//   Se guarda la clave (pqrs/<archivo>) y se entregan con enlaces firmados que
//   vencen.

// Carpeta base de los archivos: por defecto la del backend (igual en
// desarrollo con tsx y en producción desde dist/). En un hosting con disco
// persistente, FILES_DIR apunta a ese disco.
const FILES_DIR = process.env.FILES_DIR ?? path.join(__dirname, "../..");
export const UPLOADS_DIR = path.join(FILES_DIR, "uploads");
const PRIVATE_DIR = path.join(FILES_DIR, "uploads-private");
fs.mkdirSync(path.join(UPLOADS_DIR, "products"), { recursive: true });
fs.mkdirSync(path.join(PRIVATE_DIR, "pqrs"), { recursive: true });

export const PRODUCT_IMAGE_PREFIX = "/uploads/products/";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const trimSlash = (url: string) => url.replace(/\/$/, "");
const apiBaseUrl = () => trimSlash(process.env.BACKEND_URL ?? "http://localhost:4000");
// Dónde se ven las imágenes públicas: la API (modo local) o el bucket público.
const filesBaseUrl = () => trimSlash(process.env.PUBLIC_FILES_URL ?? apiBaseUrl());

const useS3 = () => process.env.STORAGE_DRIVER === "s3";

let s3Client: S3Client | null = null;
function s3(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
      // Los proveedores compatibles (como R2) no siempre aceptan las sumas de
      // verificación opcionales que el SDK agrega por defecto.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return s3Client;
}
const publicBucket = () => process.env.S3_PUBLIC_BUCKET!;
const privateBucket = () => process.env.S3_PRIVATE_BUCKET!;

// --- Tipo real del archivo ---
// Se decide por los primeros bytes, no por el nombre ni por el tipo que
// declara el navegador (ambos los controla quien sube el archivo).

export interface DetectedType {
  mime: string;
  ext: string;
  media: "image" | "video";
}

export function detectFileType(buffer: Buffer): DetectedType | null {
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString("latin1");
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg", media: "image" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: ".png", media: "image" };
  if (buffer.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return { mime: "image/gif", ext: ".gif", media: "image" };
  if (buffer.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: ".webp", media: "image" };
  if (buffer.length >= 12 && ascii(4, 8) === "ftyp") {
    return ascii(8, 12) === "qt  " ? { mime: "video/quicktime", ext: ".mov", media: "video" } : { mime: "video/mp4", ext: ".mp4", media: "video" };
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return { mime: "video/webm", ext: ".webm", media: "video" };
  return null;
}

// --- Guardar ---

export type UploadKind = "products" | "pqrs";

// Guarda el archivo con un nombre aleatorio y la extensión de su tipo real.
// Devuelve la clave: "/uploads/products/<archivo>" o "pqrs/<archivo>".
export async function saveUpload(kind: UploadKind, buffer: Buffer, type: DetectedType): Promise<string> {
  const name = `${crypto.randomUUID()}${type.ext}`;
  if (useS3()) {
    // La clave del objeto es la misma ruta (sin la barra inicial), así la
    // dirección pública es PUBLIC_FILES_URL + ruta guardada.
    const key = kind === "products" ? `${PRODUCT_IMAGE_PREFIX}${name}` : `pqrs/${name}`;
    await s3().send(
      new PutObjectCommand({
        Bucket: kind === "products" ? publicBucket() : privateBucket(),
        Key: key.replace(/^\//, ""),
        Body: buffer,
        ContentType: type.mime,
        ...(kind === "products" ? { CacheControl: "public, max-age=31536000, immutable" } : {}),
      })
    );
    return key;
  }
  if (kind === "products") {
    await fs.promises.writeFile(path.join(UPLOADS_DIR, "products", name), buffer);
    return `${PRODUCT_IMAGE_PREFIX}${name}`;
  }
  await fs.promises.writeFile(path.join(PRIVATE_DIR, "pqrs", name), buffer);
  return `pqrs/${name}`;
}

// --- Imágenes de productos ---

// Dirección completa para mostrar una imagen guardada (las externas, como las
// de Unsplash, pasan tal cual).
export function publicImageUrl(stored: string): string {
  return stored.startsWith(PRODUCT_IMAGE_PREFIX) ? `${filesBaseUrl()}${stored}` : stored;
}

export function withPublicImages<T extends { images: string[] }>(product: T): T {
  return { ...product, images: product.images.map(publicImageUrl) };
}

// Lo que llega del panel (la dirección completa que devolvió la subida, o
// una externa) se guarda como ruta relativa si es de este servidor. Solo se
// aceptan imágenes propias o direcciones https; null si no es válida.
export function toStoredImage(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith(PRODUCT_IMAGE_PREFIX)) return /^\/uploads\/products\/[\w-]+\.(jpg|png|gif|webp)$/.test(trimmed) ? trimmed : null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.origin === new URL(filesBaseUrl()).origin && url.pathname.startsWith(PRODUCT_IMAGE_PREFIX)) return toStoredImage(url.pathname);
  return url.protocol === "https:" ? url.toString() : null;
}

// --- Adjuntos privados ---

function signingKey(): string {
  const secret = process.env.FILES_SIGNING_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta FILES_SIGNING_SECRET o JWT_SECRET para firmar enlaces de archivos");
  return `${secret}:archivos`;
}

function signature(key: string, expires: number): string {
  return crypto.createHmac("sha256", signingKey()).update(`${key}:${expires}`).digest("hex");
}

// Enlace temporal a un adjunto privado (sirve en <img>, <video> y enlaces,
// que no pueden enviar el token de sesión). Siempre lo entrega la API, que
// revisa la firma; nunca el bucket directamente.
export function signedPrivateUrl(key: string | null): string | null {
  if (!key) return null;
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  return `${apiBaseUrl()}/files/${key}?exp=${expires}&sig=${signature(key, expires)}`;
}

// true si la clave tiene la forma esperada y la firma es correcta y vigente.
export function isValidSignedKey(key: string, exp: unknown, sig: unknown): boolean {
  if (!/^pqrs\/[\w-]+\.(jpg|png|gif|webp|mp4|mov|webm)$/.test(key)) return false;
  const expires = Number(exp);
  if (!Number.isInteger(expires) || expires < Date.now() / 1000 || typeof sig !== "string") return false;
  const expected = Buffer.from(signature(key, expires));
  const received = Buffer.from(sig);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// Envía un adjunto privado desde donde esté guardado. false si no existe.
export async function sendPrivateFile(res: Response, key: string): Promise<boolean> {
  if (!useS3()) {
    const file = path.join(PRIVATE_DIR, key);
    if (!fs.existsSync(file)) return false;
    res.sendFile(file);
    return true;
  }
  try {
    const object = await s3().send(new GetObjectCommand({ Bucket: privateBucket(), Key: key }));
    if (object.ContentType) res.setHeader("Content-Type", object.ContentType);
    if (object.ContentLength !== undefined) res.setHeader("Content-Length", String(object.ContentLength));
    (object.Body as Readable).pipe(res);
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return false;
    throw err;
  }
}

// Para las pruebas: borrar lo que subieron.
export async function deleteUpload(key: string) {
  if (useS3()) {
    const isProduct = key.startsWith(PRODUCT_IMAGE_PREFIX);
    await s3().send(new DeleteObjectCommand({ Bucket: isProduct ? publicBucket() : privateBucket(), Key: key.replace(/^\//, "") }));
    return;
  }
  const file = key.startsWith(PRODUCT_IMAGE_PREFIX) ? path.join(UPLOADS_DIR, key.slice("/uploads/".length)) : path.join(PRIVATE_DIR, key);
  await fs.promises.rm(file, { force: true });
}
