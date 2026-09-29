import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { CATEGORY_ICON_NAMES } from "../lib/categoryIcons";

export const categoriesRouter = Router();

categoriesRouter.get(
  "/",
  catchAsync(async (_req, res) => {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    res.json(categories);
  })
);

const categorySchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  icon: z.enum(CATEGORY_ICON_NAMES).nullable().optional(),
});

categoriesRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const category = await prisma.category.create({ data: parsed.data });
    res.status(201).json(category);
  })
);

categoriesRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = categorySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(category);
  })
);

categoriesRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
