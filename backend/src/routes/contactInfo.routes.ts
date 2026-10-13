import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { parseNit } from "../lib/tax";

export const contactInfoRouter = Router();

// Mientras no se guarden los datos reales en el panel (Contacto).
export const DEFAULTS = {
  legalName: "Tienda Virtual (sitio de demostración)",
  nit: "",
  phone: "+57 300 000 0000",
  whatsapp: "+57 300 000 0000",
  email: "contacto@tiendavirtual.test",
  address: "Calle Falsa 123, Bogotá, Colombia",
};

contactInfoRouter.get(
  "/",
  catchAsync(async (_req, res) => {
    const info = await prisma.contactInfo.findUnique({ where: { id: "main" } });
    res.json(info ?? { id: "main", ...DEFAULTS });
  })
);

const contactInfoSchema = z.object({
  // Opcionales: si no se envían, no se tocan.
  legalName: z.string().trim().max(200).optional(),
  // Vacío mientras no se configure; si se escribe, con dígito de verificación correcto.
  nit: z
    .string()
    .trim()
    .refine((value) => value === "" || parseNit(value) !== null, "NIT inválido: escríbelo con el dígito de verificación (p. ej. 900123456-7)")
    .transform((value) => {
      const nit = parseNit(value);
      return nit ? `${nit.number}-${nit.dv}` : "";
    })
    .optional(),
  phone: z.string().trim().min(1),
  whatsapp: z.string().trim().min(1),
  email: z.string().trim().email(),
  address: z.string().trim().min(1),
});

contactInfoRouter.put(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = contactInfoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const info = await prisma.contactInfo.upsert({
      where: { id: "main" },
      create: { id: "main", ...parsed.data },
      update: parsed.data,
    });
    res.json(info);
  })
);
