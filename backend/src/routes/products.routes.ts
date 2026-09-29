import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin, isAdminRequest } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const productsRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  categoryId: z.string().optional(),
  search: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  brand: z.string().optional(),
  onSale: z.coerce.boolean().optional(),
});

productsRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize, categoryId, search, minPrice, maxPrice, brand, onSale } = parsed.data;

    // Los administradores autenticados también ven productos desactivados,
    // para poder reactivarlos desde el panel; el catálogo público no.
    const includeInactive = await isAdminRequest(req);

    const where = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      ...(brand ? { brand } : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? { price: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) } }
        : {}),
      // "Ofertas relámpago": productos con un descuento vigente ahora mismo.
      ...(onSale ? { discountPercentage: { not: null }, discountEndsAt: { gte: new Date() } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: onSale ? [{ discountPercentage: "desc" as const }, { createdAt: "desc" as const }] : { createdAt: "desc" as const },
        include: { category: true },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  })
);

productsRouter.get(
  "/filters",
  catchAsync(async (_req, res) => {
    const [aggregate, brands] = await Promise.all([
      prisma.product.aggregate({
        where: { isActive: true },
        _min: { price: true },
        _max: { price: true },
      }),
      prisma.product.findMany({
        where: { isActive: true, brand: { not: null } },
        select: { brand: true },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
      }),
    ]);

    res.json({
      minPrice: aggregate._min.price ?? 0,
      maxPrice: aggregate._max.price ?? 0,
      brands: brands.map((b) => b.brand).filter((b): b is string => Boolean(b)),
    });
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
  discountPercentage: z.number().int().min(1).max(99).nullable().optional(),
  discountDurationDays: z.number().int().positive().nullable().optional(),
  brand: z.string().trim().min(1).nullable().optional(),
  stock: z.number().int().min(0),
  categoryId: z.string().min(1),
  images: z.array(z.string().trim().min(1)).length(4, "Se requieren exactamente 4 imágenes"),
  weightInGrams: z.number().int().positive(),
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  depthCm: z.number().positive(),
  sku: z.string().trim().min(1),
  isActive: z.boolean().default(true),
});

type DiscountInput = { discountPercentage?: number | null; discountDurationDays?: number | null };

// La duración del descuento se recibe en días (más natural para el admin). Cada
// cambio queda registrado en ProductDiscountLog (quién, cuánto, desde/hasta) para
// poder explicar después por qué un pedido se facturó con un precio distinto al
// actual — si había un descuento vigente cuando se corta el log anterior (aunque
// haya sido antes de su fecha de vencimiento planeada) y se abre uno nuevo.
async function applyDiscountChange(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  productId: string,
  adminUserId: string,
  input: DiscountInput
): Promise<{ discountEndsAt?: Date | null }> {
  const touchesDiscount = "discountPercentage" in input || "discountDurationDays" in input;
  if (!touchesDiscount) return {};

  const now = new Date();
  await tx.productDiscountLog.updateMany({
    where: { productId, endsAt: { gt: now } },
    data: { endsAt: now },
  });

  if (input.discountPercentage === null) {
    return { discountEndsAt: null };
  }
  if (input.discountPercentage && input.discountDurationDays) {
    const endsAt = new Date(now.getTime() + input.discountDurationDays * 24 * 60 * 60 * 1000);
    await tx.productDiscountLog.create({
      data: {
        productId,
        discountPercentage: input.discountPercentage,
        startedAt: now,
        endsAt,
        createdById: adminUserId,
      },
    });
    return { discountEndsAt: endsAt };
  }
  return {};
}

function stripDiscountDuration<T extends DiscountInput>(input: T): Omit<T, "discountDurationDays"> {
  const { discountDurationDays: _discountDurationDays, ...rest } = input;
  return rest;
}

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
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: stripDiscountDuration(parsed.data) });
      const discountFields = await applyDiscountChange(tx, created.id, req.user!.userId, parsed.data);
      if (Object.keys(discountFields).length === 0) return created;
      return tx.product.update({ where: { id: created.id }, data: discountFields });
    });
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
    const product = await prisma.$transaction(async (tx) => {
      const discountFields = await applyDiscountChange(tx, req.params.id, req.user!.userId, parsed.data);
      return tx.product.update({
        where: { id: req.params.id },
        data: { ...stripDiscountDuration(parsed.data), ...discountFields },
      });
    });
    res.json(product);
  })
);

productsRouter.get(
  "/:id/discount-logs",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const logs = await prisma.productDiscountLog.findMany({
      where: { productId: req.params.id },
      orderBy: { startedAt: "desc" },
      include: { createdBy: { select: { id: true, email: true } } },
    });
    res.json(logs);
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
