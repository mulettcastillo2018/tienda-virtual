import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, isAdminRequest } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const socialLinksRouter = Router();

socialLinksRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const isAdmin = await isAdminRequest(req);

    const links = await prisma.socialLink.findMany({
      where: isAdmin ? {} : { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(links);
  })
);

const socialLinkSchema = z.object({
  name: z.string().trim().min(1),
  iconUrl: z.string().trim().min(1),
  url: z.string().trim().url(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

socialLinksRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = socialLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const link = await prisma.socialLink.create({ data: parsed.data });
    res.status(201).json(link);
  })
);

socialLinksRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = socialLinkSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const link = await prisma.socialLink.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(link);
  })
);

socialLinksRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.socialLink.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
