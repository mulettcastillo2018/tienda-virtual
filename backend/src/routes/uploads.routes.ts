import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { createRateLimiter, limitRequests } from "../lib/rateLimit";
import { detectFileType, publicImageUrl, saveUpload, signedPrivateUrl, type UploadKind } from "../services/storage";

export const uploadsRouter = Router();

// Topes por usuario: sin ellos, cualquier cliente registrado podría llenar el
// disco del servidor con adjuntos de 25 MB.
const attachmentsByUser = createRateLimiter(10, 60 * 60_000);
const productImagesByUser = createRateLimiter(60, 60 * 60_000);
const byUser = (req: Request) => req.user!.userId;

// El archivo queda en memoria para revisar su contenido antes de guardarlo.
function receiveFile(maxBytes: number) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single("file");
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err) {
        const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
        res.status(400).json({ error: tooBig ? `El archivo supera el máximo de ${maxBytes / 1024 / 1024} MB.` : "No se pudo recibir el archivo." });
        return;
      }
      next();
    });
  };
}

// Guarda el archivo si su contenido real es de un tipo permitido.
function storeFile(kind: UploadKind, allowVideo: boolean, invalidMessage: string) {
  return catchAsync(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo." });
      return;
    }
    const type = detectFileType(req.file.buffer);
    if (!type || (type.media === "video" && !allowVideo)) {
      res.status(400).json({ error: invalidMessage });
      return;
    }
    const key = await saveUpload(kind, req.file.buffer, type);
    await prisma.uploadedFile.create({ data: { key, ownerId: req.user!.userId, kind, mimeType: type.mime, sizeBytes: req.file.size } });
    res.status(201).json({ key, url: kind === "products" ? publicImageUrl(key) : signedPrivateUrl(key) });
  });
}

uploadsRouter.post(
  "/product-image",
  requireAuth,
  requireAdmin,
  limitRequests(productImagesByUser, byUser, "Demasiadas imágenes subidas en poco tiempo. Espera un momento."),
  receiveFile(5 * 1024 * 1024),
  storeFile("products", false, "El archivo no es una imagen válida. Usa JPG, PNG, WEBP o GIF.")
);

uploadsRouter.post(
  "/pqrs-attachment",
  requireAuth,
  limitRequests(attachmentsByUser, byUser, "Ya subiste varios adjuntos en la última hora. Intenta más tarde."),
  receiveFile(25 * 1024 * 1024),
  storeFile("pqrs", true, "El archivo no es una imagen o un video válido. Usa JPG, PNG, WEBP, GIF, MP4, WEBM o MOV.")
);
