import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, isAdminRequest } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const paymentMethodsRouter = Router();

paymentMethodsRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const isAdmin = await isAdminRequest(req);

    const methods = await prisma.paymentMethod.findMany({
      where: isAdmin ? {} : { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(methods);
  })
);

const paymentMethodSchema = z.object({
  name: z.string().trim().min(1),
  logoUrl: z.string().trim().min(1),
  websiteUrl: z.string().trim().url(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

paymentMethodsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = paymentMethodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const method = await prisma.paymentMethod.create({ data: parsed.data });
    res.status(201).json(method);
  })
);

paymentMethodsRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = paymentMethodSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const method = await prisma.paymentMethod.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(method);
  })
);

paymentMethodsRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.paymentMethod.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
