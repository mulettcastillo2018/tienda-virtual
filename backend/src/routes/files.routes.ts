import { Router } from "express";
import { verifiedPrivatePath } from "../services/storage";

// Adjuntos privados, servidos solo con un enlace firmado vigente (lo generan
// las respuestas de PQRS para quien tiene derecho a verlos).
export const filesRouter = Router();

filesRouter.get("/pqrs/:name", (req, res) => {
  const file = verifiedPrivatePath(`pqrs/${req.params.name}`, req.query.exp, req.query.sig);
  if (!file) {
    res.status(403).json({ error: "El enlace no es válido o ya venció." });
    return;
  }
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.sendFile(file);
});
