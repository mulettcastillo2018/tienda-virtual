import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const productsRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().optional(),
  search: z.string().optional(),
});

productsRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize, categoryId, search } = parsed.data;

    const where = {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { category: true },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  })
);

productsRouter.get(
  "/:id",
  catchAsync(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true },
    });
    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }
    res.json(product);
  })
);

const productSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  price: z.number().int().positive(),
  stock: z.number().int().min(0),
  categoryId: z.string().min(1),
  images: z.array(z.string()).default([]),
  weightInGrams: z.number().int().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  depthCm: z.number().positive(),
  sku: z.string().trim().min(1),
  isActive: z.boolean().default(true),
});

productsRouter.post(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const product = await prisma.product.create({ data: parsed.data });
    res.status(201).json(product);
  })
);

productsRouter.put(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = productSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(product);
  })
);

productsRouter.delete(
  "/:id",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).send();
  })
);
