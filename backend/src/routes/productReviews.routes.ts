import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { pageArgs, pageQuery } from "../lib/pagination";
import { deliveredOrderWith, maskEmail } from "../services/productReviews.service";

// Reseñas de producto: las publica quien recibió el producto; la tienda
// responde y solo oculta contenido ofensivo, con motivo.
export const productReviewsRouter = Router();

// --- Panel (antes de las rutas por producto) ---

const adminListSchema = z.object({
  ...pageQuery,
  // UNANSWERED: sin respuesta de la tienda; HIDDEN: ocultas.
  filter: z.enum(["ALL", "UNANSWERED", "HIDDEN"]).default("ALL"),
});

productReviewsRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = adminListSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize, filter } = parsed.data;
    const where: Prisma.ProductReviewWhereInput =
      filter === "UNANSWERED" ? { storeReply: null, hiddenAt: null } : filter === "HIDDEN" ? { hiddenAt: { not: null } } : {};
    const [items, total, unanswered, hidden, all] = await Promise.all([
      prisma.productReview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageArgs({ page, pageSize }),
        include: { product: { select: { id: true, name: true } }, user: { select: { email: true } } },
      }),
      prisma.productReview.count({ where }),
      prisma.productReview.count({ where: { storeReply: null, hiddenAt: null } }),
      prisma.productReview.count({ where: { hiddenAt: { not: null } } }),
      prisma.productReview.count(),
    ]);
    res.json({ items, total, page, pageSize, counts: { ALL: all, UNANSWERED: unanswered, HIDDEN: hidden } });
  })
);

const replySchema = z.object({ reply: z.string().trim().min(2).max(1000).nullable() });

productReviewsRouter.post(
  "/admin/:id/reply",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "La respuesta debe tener entre 2 y 1000 caracteres." });
      return;
    }
    const updated = await prisma.productReview.updateMany({
      where: { id: req.params.id },
      data: { storeReply: parsed.data.reply, repliedAt: parsed.data.reply ? new Date() : null },
    });
    if (updated.count === 0) {
      res.status(404).json({ error: "Reseña no encontrada" });
      return;
    }
    res.json({ ok: true });
  })
);

const hideSchema = z.object({ reason: z.string().trim().min(5).max(300) });

// Ocultar exige un motivo (lenguaje ofensivo, datos personales, spam...): una
// crítica, por dura que sea, no se oculta.
productReviewsRouter.post(
  "/admin/:id/hide",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = hideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Escribe por qué se oculta (entre 5 y 300 caracteres)." });
      return;
    }
    const updated = await prisma.productReview.updateMany({ where: { id: req.params.id }, data: { hiddenAt: new Date(), hiddenReason: parsed.data.reason } });
    if (updated.count === 0) {
      res.status(404).json({ error: "Reseña no encontrada" });
      return;
    }
    res.json({ ok: true });
  })
);

productReviewsRouter.post(
  "/admin/:id/unhide",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const updated = await prisma.productReview.updateMany({ where: { id: req.params.id }, data: { hiddenAt: null, hiddenReason: null } });
    if (updated.count === 0) {
      res.status(404).json({ error: "Reseña no encontrada" });
      return;
    }
    res.json({ ok: true });
  })
);

// --- Público y cliente ---

const listSchema = z.object({ ...pageQuery, pageSize: z.coerce.number().int().min(1).max(50).default(10) });

productReviewsRouter.get(
  "/:productId",
  catchAsync(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize } = parsed.data;
    const where = { productId: req.params.productId, hiddenAt: null };
    const [items, total, byRating] = await Promise.all([
      prisma.productReview.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs({ page, pageSize }), include: { user: { select: { email: true } } } }),
      prisma.productReview.count({ where }),
      prisma.productReview.groupBy({ by: ["rating"], where, _count: { _all: true } }),
    ]);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of byRating) distribution[row.rating] = row._count._all;
    const sum = Object.entries(distribution).reduce((s, [rating, count]) => s + Number(rating) * count, 0);
    res.json({
      items: items.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        author: maskEmail(review.user.email),
        storeReply: review.storeReply,
        repliedAt: review.repliedAt,
      })),
      total,
      page,
      pageSize,
      summary: { average: total ? Math.round((sum / total) * 10) / 10 : null, count: total, distribution },
    });
  })
);

// Si el cliente puede opinar del producto y su reseña, si ya la escribió.
productReviewsRouter.get(
  "/:productId/mine",
  requireAuth,
  catchAsync(async (req, res) => {
    const [order, review] = await Promise.all([
      deliveredOrderWith(req.user!.userId, req.params.productId),
      prisma.productReview.findUnique({
        where: { productId_userId: { productId: req.params.productId, userId: req.user!.userId } },
        select: { id: true, rating: true, comment: true, storeReply: true, hiddenAt: true, hiddenReason: true, createdAt: true },
      }),
    ]);
    res.json({ canReview: Boolean(order) || Boolean(review), review });
  })
);

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(3).max(1000),
});

// Escribe o edita la reseña propia (una por producto).
productReviewsRouter.put(
  "/:productId",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Califica de 1 a 5 estrellas y escribe un comentario (entre 3 y 1000 caracteres)." });
      return;
    }
    const userId = req.user!.userId;
    const { productId } = req.params;
    const existing = await prisma.productReview.findUnique({ where: { productId_userId: { productId, userId } } });
    const order = existing ? { id: existing.orderId } : await deliveredOrderWith(userId, productId);
    if (!order) {
      res.status(403).json({ error: "Puedes opinar de un producto después de recibirlo." });
      return;
    }
    const review = await prisma.productReview.upsert({
      where: { productId_userId: { productId, userId } },
      create: { productId, userId, orderId: order.id, ...parsed.data },
      // Si estaba oculta, sigue oculta hasta que la tienda la revise de nuevo.
      update: { ...parsed.data },
    });
    res.status(existing ? 200 : 201).json(review);
  })
);

productReviewsRouter.delete(
  "/:productId",
  requireAuth,
  catchAsync(async (req, res) => {
    const deleted = await prisma.productReview.deleteMany({ where: { productId: req.params.productId, userId: req.user!.userId } });
    if (deleted.count === 0) {
      res.status(404).json({ error: "No tienes una reseña de este producto." });
      return;
    }
    res.status(204).send();
  })
);
