import { Router } from "express";
import { catchAsync } from "../lib/catchAsync";
import { isValidSignedKey, sendPrivateFile } from "../services/storage";

// Adjuntos privados, servidos solo con un enlace firmado vigente (lo generan
// las respuestas de PQRS para quien tiene derecho a verlos). Vienen del disco
// o del bucket privado, según STORAGE_DRIVER.
export const filesRouter = Router();

filesRouter.get(
  "/pqrs/:name",
  catchAsync(async (req, res) => {
    const key = `pqrs/${req.params.name}`;
    if (!isValidSignedKey(key, req.query.exp, req.query.sig)) {
      res.status(403).json({ error: "El enlace no es válido o ya venció." });
      return;
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (!(await sendPrivateFile(res, key))) {
      res.removeHeader("Cache-Control");
      res.status(404).json({ error: "El archivo ya no existe." });
    }
  })
);
