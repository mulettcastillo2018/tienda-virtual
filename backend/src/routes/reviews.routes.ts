import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const reviewsRouter = Router();

// Solo un pedido que ya se pagó (o avanzó más allá de eso) cuenta como una
// compra real habilitante para dejar una reseña.
const REVIEWABLE_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

reviewsRouter.get(
  "/",
  catchAsync(async (req, res) => {
    const pageSize = Math.min(Number(req.query.pageSize) || 15, 50);
    const [reviews, aggregate] = await Promise.all([
      prisma.storeReview.findMany({
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      }),
      prisma.storeReview.aggregate({ _avg: { rating: true }, _count: true }),
    ]);

    res.json({
      items: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        customerLabel: maskEmail(review.user.email),
      })),
      average: aggregate._avg.rating ?? 0,
      total: aggregate._count,
    });
  })
);

reviewsRouter.get(
  "/eligibility",
  requireAuth,
  catchAsync(async (req, res) => {
    const reviewableOrder = await prisma.order.findFirst({
      where: {
        userId: req.user!.userId,
        status: { in: [...REVIEWABLE_STATUSES] },
        storeReview: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });

    res.json({ eligibleOrderId: reviewableOrder?.id ?? null });
  })
);

const createReviewSchema = z.object({
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500),
});

reviewsRouter.post(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { orderId, rating, comment } = parsed.data;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user!.userId },
      include: { storeReview: true },
    });
    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    if (!REVIEWABLE_STATUSES.includes(order.status as (typeof REVIEWABLE_STATUSES)[number])) {
      res.status(403).json({ error: "Solo puedes calificar pedidos que ya hayas comprado" });
      return;
    }
    if (order.storeReview) {
      res.status(409).json({ error: "Ya calificaste este pedido" });
      return;
    }

    const review = await prisma.storeReview.create({
      data: { userId: req.user!.userId, orderId, rating, comment },
    });
    res.status(201).json(review);
  })
);
