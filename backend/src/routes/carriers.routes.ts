import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { verifyToken } from "../lib/jwt";
import { catchAsync } from "../lib/catchAsync";

export const carriersRouter = Router();

carriersRouter.get(
  "/",
  catchAsync(async (req, res) => {
    let isAdmin = false;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        isAdmin = verifyToken(header.slice(7)).role === "ADMIN";
      } catch {
        // token inválido o expirado: se trata como visitante público
      }
    }

    const carriers = await prisma.carrier.findMany({
      where: isAdmin ? {} : { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(carriers);
  })
);

const carrierSchema = z.object({
  name: z.string().trim().min(1),
  logoUrl: z.string().trim().min(1),
  websiteUrl: z.string().trim().url(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

carriersRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = carrierSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const carrier = await prisma.carrier.create({ data: parsed.data });
    res.status(201).json(carrier);
  })
);

carriersRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = carrierSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const carrier = await prisma.carrier.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(carrier);
  })
);

carriersRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.carrier.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
