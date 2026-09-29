import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrJuridico } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { sendPqrsUpdateEmail } from "../services/email.service";
import { addBusinessDays, PQRS_RESPONSE_DEADLINE_BUSINESS_DAYS } from "../lib/businessDays";

export const pqrsRouter = Router();

const statusLogInclude = {
  statusLogs: {
    orderBy: { changedAt: "asc" as const },
    include: { changedBy: { select: { id: true, email: true, role: true } } },
  },
};

const createPqrsSchema = z.object({
  type: z.enum(["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"]),
  subject: z.string().trim().min(1),
  message: z.string().trim().min(1),
  orderId: z.string().trim().optional(),
  attachmentUrl: z.string().trim().optional(),
});

pqrsRouter.post(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = createPqrsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (parsed.data.orderId) {
      const order = await prisma.order.findFirst({
        where: { id: parsed.data.orderId, userId: req.user!.userId },
      });
      if (!order) {
        res.status(404).json({ error: "El pedido indicado no existe o no te pertenece." });
        return;
      }
    }

    const dueAt = addBusinessDays(new Date(), PQRS_RESPONSE_DEADLINE_BUSINESS_DAYS);

    const pqrs = await prisma.pqrs.create({
      data: {
        ...parsed.data,
        userId: req.user!.userId,
        dueAt,
        statusLogs: {
          create: { toStatus: "RECIBIDO", changedById: req.user!.userId },
        },
      },
      include: statusLogInclude,
    });
    res.status(201).json(pqrs);
  })
);

pqrsRouter.get(
  "/me",
  requireAuth,
  catchAsync(async (req, res) => {
    const items = await prisma.pqrs.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      include: { order: { select: { id: true } }, ...statusLogInclude },
    });
    res.json(items);
  })
);

pqrsRouter.get(
  "/",
  requireAuth,
  requireAdminOrJuridico,
  catchAsync(async (_req, res) => {
    const items = await prisma.pqrs.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, phone: true } },
        respondedBy: { select: { id: true, email: true } },
        order: { select: { id: true } },
        ...statusLogInclude,
      },
    });
    res.json(items);
  })
);

pqrsRouter.get(
  "/stats",
  requireAuth,
  requireAdminOrJuridico,
  catchAsync(async (_req, res) => {
    const [byStatus, byType, resolved, overdue] = await Promise.all([
      prisma.pqrs.groupBy({ by: ["status"], _count: true }),
      prisma.pqrs.groupBy({ by: ["type"], _count: true }),
      prisma.pqrs.findMany({
        where: { respondedAt: { not: null } },
        select: { createdAt: true, respondedAt: true },
      }),
      prisma.pqrs.count({
        where: { dueAt: { lt: new Date() }, status: { notIn: ["RESUELTO", "CERRADO"] } },
      }),
    ]);

    const responseTimesHours = resolved.map(
      (p) => (p.respondedAt!.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60)
    );
    const avgResponseTimeHours = responseTimesHours.length
      ? responseTimesHours.reduce((sum, h) => sum + h, 0) / responseTimesHours.length
      : null;

    res.json({
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
      total: byStatus.reduce((sum, s) => sum + s._count, 0),
      avgResponseTimeHours,
      overdue,
    });
  })
);

async function canRespond(role: string | undefined): Promise<boolean> {
  if (role === "JURIDICO") return true;
  if (role !== "ADMIN") return false;
  const activeJuridicoCount = await prisma.user.count({ where: { role: "JURIDICO", isActive: true } });
  return activeJuridicoCount === 0;
}

const respondSchema = z.object({
  status: z.enum(["RECIBIDO", "EN_PROCESO", "RESUELTO", "CERRADO"]).optional(),
  response: z.string().trim().min(1).optional(),
  comment: z.string().trim().min(1).optional(),
  responseAttachmentUrl: z.string().trim().optional(),
});

pqrsRouter.put(
  "/:id",
  requireAuth,
  catchAsync(async (req, res) => {
    const allowed = await canRespond(req.user?.role);
    if (!allowed) {
      res.status(403).json({
        error: "Solo el área jurídica puede responder. El admin solo puede hacerlo si no hay nadie de jurídico activo.",
      });
      return;
    }

    const parsed = respondSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const existing = await prisma.pqrs.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!existing) {
      res.status(404).json({ error: "PQRS no encontrada" });
      return;
    }

    const nextStatus = parsed.data.status ?? existing.status;

    const updated = await prisma.pqrs.update({
      where: { id: req.params.id },
      data: {
        status: nextStatus,
        ...(parsed.data.response
          ? {
              response: parsed.data.response,
              responseAttachmentUrl: parsed.data.responseAttachmentUrl,
              respondedById: req.user!.userId,
              respondedAt: new Date(),
            }
          : {}),
        statusLogs: {
          create: {
            fromStatus: existing.status,
            toStatus: nextStatus,
            comment: parsed.data.comment,
            attachmentUrl: parsed.data.responseAttachmentUrl,
            changedById: req.user!.userId,
          },
        },
      },
      include: statusLogInclude,
    });

    await sendPqrsUpdateEmail(existing.user.email, {
      id: updated.id,
      subject: updated.subject,
      status: updated.status,
      response: updated.response,
    });

    res.json(updated);
  })
);
