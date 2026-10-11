import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { pageArgs, pageQuery } from "../lib/pagination";
import { isAllowedUrl } from "../services/fiscal/alanube";
import {
  connectionOf,
  FiscalError,
  fiscalSettings,
  missingSetup,
  numberingWarnings,
  processFiscalDocuments,
  resendDocument,
} from "../services/fiscal/fiscal.service";

// Facturación electrónica (panel): configuración, documentos y reenvíos.
export const fiscalRouter = Router();
fiscalRouter.use(requireAuth, requireAdmin);

async function settingsView() {
  const s = await fiscalSettings();
  const { alanubeToken, ...rest } = s;
  return {
    ...rest,
    // El token nunca vuelve al navegador: solo si está y de dónde sale.
    hasToken: Boolean(connectionOf(s)),
    tokenFromEnv: Boolean(process.env.ALANUBE_TOKEN),
    tokenSaved: Boolean(alanubeToken),
    missing: await missingSetup(s),
    warnings: numberingWarnings(s),
  };
}

fiscalRouter.get(
  "/settings",
  catchAsync(async (_req, res) => {
    res.json(await settingsView());
  })
);

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const settingsSchema = z.object({
  enabled: z.boolean(),
  alanubeUrl: z.string().trim().refine(isAllowedUrl, "Solo la API de Alegra (sandbox o producción)"),
  // Vacío = no cambiar el guardado; null = borrarlo.
  alanubeToken: z.string().trim().max(500).nullish(),
  alanubeCompanyId: z.string().trim().max(100).nullish(),
  resolutionNumber: z.string().trim().max(50).nullish(),
  prefix: z.string().trim().max(10).nullish(),
  rangeFrom: z.number().int().min(1).nullish(),
  rangeTo: z.number().int().min(1).nullish(),
  startDate: date.nullish(),
  endDate: date.nullish(),
  technicalKey: z.string().trim().max(200).nullish(),
  nextNumber: z.number().int().min(1).nullish(),
  creditNotePrefix: z.string().trim().min(1).max(10),
  creditNoteNext: z.number().int().min(1),
  shippingTaxRate: z.union([z.literal(0), z.literal(5), z.literal(19)]),
});

fiscalRouter.put(
  "/settings",
  catchAsync(async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { alanubeToken, ...data } = parsed.data;
    if (data.rangeFrom && data.rangeTo && data.rangeFrom > data.rangeTo) {
      res.status(400).json({ error: "El rango de numeración está al revés." });
      return;
    }
    const current = await fiscalSettings();
    // Al activarla, empieza a contar desde ahora: lo vendido antes no se factura.
    const enabledAt = data.enabled && !current.enabled ? new Date() : current.enabledAt;
    await prisma.fiscalSettings.update({
      where: { id: "main" },
      data: {
        ...data,
        enabledAt,
        ...(alanubeToken === null ? { alanubeToken: null } : alanubeToken ? { alanubeToken } : {}),
      },
    });
    res.json(await settingsView());
  })
);

const listSchema = z.object({ ...pageQuery, status: z.enum(["PENDING", "SENT", "ACCEPTED", "REJECTED"]).optional() });

fiscalRouter.get(
  "/documents",
  catchAsync(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize, status } = parsed.data;
    const where: Prisma.FiscalDocumentWhereInput = status ? { status } : {};
    const [items, total, byStatus] = await Promise.all([
      prisma.fiscalDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageArgs({ page, pageSize }),
        omit: { content: true, idempotencyKey: true },
        include: { cancels: { select: { prefix: true, number: true } } },
      }),
      prisma.fiscalDocument.count({ where }),
      prisma.fiscalDocument.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const counts: Record<string, number> = { ALL: 0 };
    for (const row of byStatus) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }
    res.json({ items, total, page, pageSize, counts });
  })
);

fiscalRouter.post(
  "/documents/:id/resend",
  catchAsync(async (req, res) => {
    try {
      res.json(await resendDocument(req.params.id));
    } catch (err) {
      if (!(err instanceof FiscalError)) throw err;
      res.status(err.status).json({ error: err.message });
    }
  })
);

// Corre el ciclo ya (sin esperar los 20 segundos) y devuelve cómo quedó.
fiscalRouter.post(
  "/process",
  catchAsync(async (_req, res) => {
    await processFiscalDocuments();
    res.json(await settingsView());
  })
);
