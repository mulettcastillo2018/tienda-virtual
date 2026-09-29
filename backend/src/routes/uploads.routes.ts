import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { createRateLimiter, limitRequests } from "../lib/rateLimit";

export const uploadsRouter = Router();

// Topes por usuario: sin ellos, cualquier cliente registrado podría llenar el
// disco del servidor con adjuntos de 25 MB.
const attachmentsByUser = createRateLimiter(10, 60 * 60_000);
const productImagesByUser = createRateLimiter(60, 60 * 60_000);
const byUser = (req: Request) => req.user!.userId;

const productsDir = path.join(__dirname, "../../uploads/products");
fs.mkdirSync(productsDir, { recursive: true });

const pqrsDir = path.join(__dirname, "../../uploads/pqrs");
fs.mkdirSync(pqrsDir, { recursive: true });

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PQRS_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, "video/mp4", "video/webm", "video/quicktime"]);

function makeStorage(dir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

const uploadProductImage = multer({
  storage: makeStorage(productsDir),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Formato de imagen no soportado. Usa JPG, PNG, WEBP o GIF."));
      return;
    }
    cb(null, true);
  },
});

const uploadPqrsAttachment = multer({
  storage: makeStorage(pqrsDir),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PQRS_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Formato no soportado. Usa JPG, PNG, WEBP, GIF, MP4, WEBM o MOV."));
      return;
    }
    cb(null, true);
  },
});

function handleUpload(uploader: ReturnType<typeof multer>) {
  return (req: Request, res: Response, next: NextFunction) => {
    uploader.single("file")(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "No se pudo subir el archivo." });
        return;
      }
      next();
    });
  };
}

uploadsRouter.post(
  "/product-image",
  requireAuth,
  requireAdmin,
  limitRequests(productImagesByUser, byUser, "Demasiadas imágenes subidas en poco tiempo. Espera un momento."),
  handleUpload(uploadProductImage),
  catchAsync(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo." });
      return;
    }
    const url = `${req.protocol}://${req.get("host")}/uploads/products/${req.file.filename}`;
    res.status(201).json({ url });
  })
);

uploadsRouter.post(
  "/pqrs-attachment",
  requireAuth,
  limitRequests(attachmentsByUser, byUser, "Ya subiste varios adjuntos en la última hora. Intenta más tarde."),
  handleUpload(uploadPqrsAttachment),
  catchAsync(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo." });
      return;
    }
    const url = `${req.protocol}://${req.get("host")}/uploads/pqrs/${req.file.filename}`;
    res.status(201).json({ url });
  })
);
