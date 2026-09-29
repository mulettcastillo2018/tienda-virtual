import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdminOrJuridico } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { createRateLimiter, limitRequests } from "../lib/rateLimit";
import { sendPqrsUpdateEmail } from "../services/email.service";
import { signedPrivateUrl } from "../services/storage";
import { addBusinessDays, PQRS_RESPONSE_DEADLINE_BUSINESS_DAYS } from "../lib/businessDays";

export const pqrsRouter = Router();

// Un cliente con un problema real no radica decenas de solicitudes al día.
const requestsByUser = createRateLimiter(10, 24 * 60 * 60_000);

const statusLogInclude = {
  statusLogs: {
    orderBy: { changedAt: "asc" as const },
    include: { changedBy: { select: { id: true, email: true, role: true } } },
  },
};

type PqrsWithLogs = Prisma.PqrsGetPayload<{ include: typeof statusLogInclude }>;

// Los adjuntos se guardan como claves privadas; al responder se cambian por
// enlaces firmados que vencen en una hora.
function withSignedAttachments<T extends PqrsWithLogs>(pqrs: T) {
  return {
    ...pqrs,
    attachmentUrl: signedPrivateUrl(pqrs.attachmentUrl),
    responseAttachmentUrl: signedPrivateUrl(pqrs.responseAttachmentUrl),
    statusLogs: pqrs.statusLogs.map((log) => ({ ...log, attachmentUrl: signedPrivateUrl(log.attachmentUrl) })),
  };
}

// Lo que ve el cliente: sin los comentarios internos del equipo ni el correo
// de quien atendió (solo si fue el cliente o la tienda).
function customerView(pqrs: PqrsWithLogs) {
  const { respondedById: _respondedBy, ...signed } = withSignedAttachments(pqrs);
  return {
    ...signed,
    statusLogs: signed.statusLogs.map(({ comment: _comment, changedById: _changedById, changedBy, ...log }) => ({
      ...log,
      changedBy: { role: changedBy.role },
    })),
  };
}

// Un adjunto solo puede ser un archivo que subió la misma persona como
// adjunto de PQRS (no uno ajeno ni una dirección cualquiera).
async function ownAttachment(key: string | undefined, userId: string): Promise<string | null | undefined> {
  if (!key) return undefined;
  const file = await prisma.uploadedFile.findUnique({ where: { key } });
  return file && file.ownerId === userId && file.kind === "pqrs" ? file.key : null;
}

const INVALID_ATTACHMENT = "El adjunto no es válido: súbelo de nuevo.";

const createPqrsSchema = z.object({
  type: z.enum(["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"]),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  orderId: z.string().trim().optional(),
  attachmentKey: z.string().trim().optional(),
});

pqrsRouter.post(
  "/",
  requireAuth,
  limitRequests(requestsByUser, (req) => req.user!.userId, "Ya radicaste varias solicitudes hoy. Si es urgente, escríbenos por WhatsApp."),
  catchAsync(async (req, res) => {
    const parsed = createPqrsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { attachmentKey, ...data } = parsed.data;

    if (data.orderId) {
      const order = await prisma.order.findFirst({
        where: { id: data.orderId, userId: req.user!.userId },
      });
      if (!order) {
        res.status(404).json({ error: "El pedido indicado no existe o no te pertenece." });
        return;
      }
    }
    const attachment = await ownAttachment(attachmentKey, req.user!.userId);
    if (attachment === null) {
      res.status(400).json({ error: INVALID_ATTACHMENT });
      return;
    }

    const dueAt = addBusinessDays(new Date(), PQRS_RESPONSE_DEADLINE_BUSINESS_DAYS);

    const pqrs = await prisma.pqrs.create({
      data: {
        ...data,
        attachmentUrl: attachment,
        userId: req.user!.userId,
        dueAt,
        statusLogs: {
          create: { toStatus: "RECIBIDO", changedById: req.user!.userId },
        },
      },
      include: statusLogInclude,
    });
    res.status(201).json(customerView(pqrs));
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
    res.json(items.map(customerView));
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
    res.json(items.map(withSignedAttachments));
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
  response: z.string().trim().min(1).max(5000).optional(),
  comment: z.string().trim().min(1).max(2000).optional(),
  responseAttachmentKey: z.string().trim().optional(),
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
    const attachment = await ownAttachment(parsed.data.responseAttachmentKey, req.user!.userId);
    if (attachment === null) {
      res.status(400).json({ error: INVALID_ATTACHMENT });
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
              responseAttachmentUrl: attachment,
              respondedById: req.user!.userId,
              respondedAt: new Date(),
            }
          : {}),
        statusLogs: {
          create: {
            fromStatus: existing.status,
            toStatus: nextStatus,
            comment: parsed.data.comment,
            attachmentUrl: attachment,
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

    res.json(withSignedAttachments(updated));
  })
);
