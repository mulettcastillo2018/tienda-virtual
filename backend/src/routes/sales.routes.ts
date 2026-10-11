import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const salesRouter = Router();

// Una venta es un pedido pagado en línea (esté en preparación, enviado o
// entregado) o uno contra entrega ya entregado, que es cuando se cobra.
function sold(alias: string) {
  const o = Prisma.raw(`"${alias}"`);
  return Prisma.sql`((${o}."paymentOption" = 'ONLINE' AND ${o}."status"::text IN ('PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'))
    OR (${o}."paymentOption" = 'CASH_ON_DELIVERY' AND ${o}."status" = 'DELIVERED'))`;
}
// Los días se cuentan en hora de Colombia (UTC-5, sin horario de verano).
const TZ_OFFSET_MS = 5 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const summarySchema = z.object({ days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)])).default(30) });

// Medianoche (en Colombia) de hace `daysAgo` días, como instante UTC.
function localMidnight(now: Date, daysAgo: number) {
  const local = new Date(now.getTime() - TZ_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysAgo) + TZ_OFFSET_MS);
}

function localDay(date: Date) {
  return new Date(date.getTime() - TZ_OFFSET_MS).toISOString().slice(0, 10);
}

async function totals(from: Date, to: Date) {
  const [row] = await prisma.$queryRaw<{ orders: number; revenue: number; units: number }[]>`
    SELECT COUNT(DISTINCT o."id")::int AS orders,
           COALESCE(SUM(o."totalAmount"), 0)::float8 AS revenue,
           COALESCE((SELECT SUM(i."quantity") FROM "OrderItem" i JOIN "Order" x ON x."id" = i."orderId"
                     WHERE ${sold("x")} AND x."createdAt" >= ${from} AND x."createdAt" < ${to}), 0)::int AS units
    FROM "Order" o
    WHERE ${sold("o")} AND o."createdAt" >= ${from} AND o."createdAt" < ${to}`;
  return { ...row, avgTicket: row.orders ? Math.round(row.revenue / row.orders) : 0 };
}

// Resumen de ventas del periodo (7, 30 o 90 días contando hoy) comparado con
// el periodo anterior de la misma duración, ventas por día y lo más vendido.
salesRouter.get(
  "/summary",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = summarySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "El periodo debe ser 7, 30 o 90 días." });
      return;
    }
    const { days } = parsed.data;
    const now = new Date();
    const from = localMidnight(now, days - 1);
    const previousFrom = new Date(from.getTime() - days * DAY_MS);

    const [current, previous, daily, topProducts, byStatus, toShip, toConfirm] = await Promise.all([
      totals(from, now),
      totals(previousFrom, from),
      prisma.$queryRaw<{ day: string; orders: number; revenue: number }[]>`
        SELECT to_char((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS orders, SUM(o."totalAmount")::float8 AS revenue
        FROM "Order" o
        WHERE ${sold("o")} AND o."createdAt" >= ${from}
        GROUP BY day`,
      prisma.$queryRaw<{ id: string; name: string; units: number; revenue: number }[]>`
        SELECT p."id", p."name", SUM(i."quantity")::int AS units, SUM(i."quantity" * i."priceAtPurchase")::float8 AS revenue
        FROM "OrderItem" i
        JOIN "Order" o ON o."id" = i."orderId"
        JOIN "Product" p ON p."id" = i."productId"
        WHERE ${sold("o")} AND o."createdAt" >= ${from}
        GROUP BY p."id", p."name"
        ORDER BY units DESC, revenue DESC
        LIMIT 5`,
      prisma.order.groupBy({ by: ["status"], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
      prisma.order.count({ where: { status: "PENDING", paymentOption: "CASH_ON_DELIVERY" } }),
    ]);

    // Todos los días del periodo, también los que no tuvieron ventas.
    const byDay = new Map(daily.map((row) => [row.day, row]));
    const series = Array.from({ length: days }, (_, index) => {
      const day = localDay(new Date(from.getTime() + index * DAY_MS));
      const row = byDay.get(day);
      return { date: day, orders: row?.orders ?? 0, revenue: row?.revenue ?? 0 };
    });

    res.json({
      days,
      from: localDay(from),
      to: localDay(now),
      current,
      previous,
      daily: series,
      topProducts,
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      toShip,
      toConfirm,
    });
  })
);
