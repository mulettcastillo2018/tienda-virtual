import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const contactInfoRouter = Router();

const DEFAULTS = {
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
