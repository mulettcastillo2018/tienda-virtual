import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { getStoreSettings, normalizeCity } from "../services/storeSettings";

export const settingsRouter = Router();

// Reglas del pago contra entrega (panel de administración).
settingsRouter.get(
  "/cash-on-delivery",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    res.json(await getStoreSettings());
  })
);

const codSchema = z.object({
  codEnabled: z.boolean(),
  codCities: z.array(z.string().trim().min(2).max(80)).max(100),
  codMaxAmount: z.number().int().min(10000).max(100_000_000),
  codFee: z.number().int().min(0).max(1_000_000),
});

settingsRouter.put(
  "/cash-on-delivery",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = codSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    // Sin repetidas (sin importar tildes ni mayúsculas) y en el orden en que se escribieron.
    const codCities = [...new Map(parsed.data.codCities.map((city) => [normalizeCity(city), city])).values()];
    if (parsed.data.codEnabled && codCities.length === 0) {
      res.status(400).json({ error: "Para activar el pago contra entrega escribe al menos una ciudad." });
      return;
    }
    const data = { ...parsed.data, codCities };
    await prisma.storeSettings.upsert({ where: { id: "main" }, create: { id: "main", ...data }, update: data });
    res.json(await getStoreSettings());
  })
);
