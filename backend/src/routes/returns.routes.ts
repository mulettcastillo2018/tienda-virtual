import { Router, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { pageArgs, pageQuery } from "../lib/pagination";
import { guestOrderUrl, isValidOrderToken } from "../lib/orderAccess";
import { sendReturnUpdateEmail } from "../services/email.service";
import {
  approveReturn,
  createReturnRequest,
  receiveReturn,
  refundReturn,
  rejectReturn,
  ReturnError,
  REVERSION_CAUSES,
} from "../services/returns.service";

// Retracto (Ley 1480, art. 47) y reversión del pago (art. 51): el cliente lo
// pide desde su pedido y la tienda lo tramita en el panel.
export const returnsRouter = Router();

const requestSchema = z.object({
  type: z.enum(["RETRACTO", "REVERSION"]),
  cause: z.enum(REVERSION_CAUSES).nullish(),
  note: z.string().trim().max(1000).nullish(),
});

function respondReturnError(res: Response, err: unknown) {
  if (!(err instanceof ReturnError)) throw err;
  res.status(err.status).json({ error: err.message });
}

// Aviso al cliente (con cuenta, a su correo; invitado, con el enlace de su pedido).
async function notify(requestId: string) {
  try {
    const request = await prisma.returnRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { order: { select: { id: true, guestEmail: true, user: { select: { email: true } } } } },
    });
    const email = request.order.user?.email ?? request.order.guestEmail;
    if (!email) return;
    await sendReturnUpdateEmail(email, {
      orderId: request.order.id,
      type: request.type,
      status: request.status,
      storeNote: request.storeNote,
      orderUrl: request.order.user ? null : guestOrderUrl(request.order.id),
    });
  } catch (err) {
    console.error(`No se pudo avisar la solicitud ${requestId}:`, err);
  }
}

returnsRouter.post(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = requestSchema.extend({ orderId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const order = await prisma.order.findFirst({ where: { id: parsed.data.orderId, userId: req.user!.userId }, select: { id: true } });
    if (!order) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    try {
      const request = await createReturnRequest(order.id, parsed.data);
      await notify(request.id);
      res.status(201).json(request);
    } catch (err) {
      respondReturnError(res, err);
    }
  })
);

// Invitado: con el token del enlace de su pedido.
returnsRouter.post(
  "/guest/:orderId",
  catchAsync(async (req, res) => {
    if (!isValidOrderToken(req.params.orderId, req.get("x-order-token"))) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const order = await prisma.order.findFirst({ where: { id: req.params.orderId, userId: null }, select: { id: true } });
    if (!order) {
      res.status(404).json({ error: "Orden no encontrada" });
      return;
    }
    try {
      const request = await createReturnRequest(order.id, parsed.data);
      await notify(request.id);
      res.status(201).json(request);
    } catch (err) {
      respondReturnError(res, err);
    }
  })
);

// --- Panel ---

const STATUSES = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED"] as const;
const listSchema = z.object({ ...pageQuery, status: z.enum(STATUSES).optional() });

returnsRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize, status } = parsed.data;
    const where: Prisma.ReturnRequestWhereInput = status ? { status } : {};
    const [items, total, byStatus] = await Promise.all([
      prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageArgs({ page, pageSize }),
        include: {
          order: {
            select: {
              id: true,
              status: true,
              totalAmount: true,
              paymentOption: true,
              guestEmail: true,
              shippingFullName: true,
              shippingPhone: true,
              user: { select: { email: true } },
              payments: { where: { status: "APPROVED" }, select: { paymentMethod: true, providerTransactionId: true } },
            },
          },
        },
      }),
      prisma.returnRequest.count({ where }),
      prisma.returnRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const counts: Record<string, number> = { ALL: 0 };
    for (const row of byStatus) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }
    res.json({ items, total, page, pageSize, counts });
  })
);

const noteSchema = z.object({ note: z.string().trim().max(500).nullish() });
const requiredNoteSchema = z.object({ note: z.string().trim().min(3).max(500) });
const refundSchema = z.object({ reference: z.string().trim().min(3).max(120) });

// Cada paso del trámite: valida, aplica y avisa al cliente.
function step<T extends z.ZodTypeAny>(path: string, schema: T, run: (id: string, body: z.infer<T>, adminId: string) => Promise<unknown>, invalid: string) {
  returnsRouter.post(
    `/:id/${path}`,
    requireAuth,
    requireAdmin,
    catchAsync(async (req, res) => {
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: invalid });
        return;
      }
      try {
        const result = await run(req.params.id, parsed.data, req.user!.userId);
        await notify(req.params.id);
        res.json(result);
      } catch (err) {
        respondReturnError(res, err);
      }
    })
  );
}

step("approve", noteSchema, (id, body) => approveReturn(id, body.note ?? null), "La nota no puede pasar de 500 caracteres.");
step("reject", requiredNoteSchema, (id, body) => rejectReturn(id, body.note), "Explica por qué no procede (entre 3 y 500 caracteres).");
step("receive", z.object({}), (id) => receiveReturn(id), "Solicitud inválida.");
step("refund", refundSchema, (id, body, adminId) => refundReturn(id, body.reference, adminId), "Escribe la referencia del reembolso (p. ej. el número de la transacción).");
