"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Banknote, Truck } from "lucide-react";
import { usePagedList } from "@/lib/usePagedList";
import { useT, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { ORDER_STATUS_TONE } from "@/lib/statusTones";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Skeleton } from "@/components/ui/Skeleton";
import type { OrderStatus, SalesSummary, SalesTotals } from "@/lib/types";

const PERIODS = [7, 30, 90] as const;
const STATUSES: OrderStatus[] = ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

// Para el eje: "$ 1,2 M" en vez de "$ 1.200.000".
function formatCompactCOP(amount: number, locale: "es" | "en") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CO", {
    style: "currency",
    currency: "COP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

// Las fechas llegan como día local ("2026-10-11"); a mediodía para que ninguna zona horaria las corra.
function formatDay(date: string, locale: "es" | "en", withWeekday = false) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", {
    day: "numeric",
    month: "short",
    ...(withWeekday ? { weekday: "short" } : {}),
  }).format(new Date(`${date}T12:00:00`));
}

// Tope del eje redondeado hacia arriba a un múltiplo de media potencia de 10
// (1.166.000 → 1.500.000), para que las marcas sean números limpios.
function niceCeil(value: number) {
  if (value <= 0) return 0;
  const step = 10 ** Math.floor(Math.log10(value)) / 2;
  return Math.ceil(value / step) * step;
}

function Kpi({ label, value, hint, delta }: { label: string; value: string; hint?: string; delta: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-suave sm:p-5">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      <div className="mt-2 text-xs">{delta}</div>
    </div>
  );
}

export default function AdminSalesPage() {
  const t = useT();
  const locale = useLocale();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { data, error } = usePagedList<SalesSummary>("/sales/summary", { days }, t("adminSales.loadError"));
  // Mientras llega el periodo nuevo se sigue viendo el anterior, atenuado.
  const loading = !data || data.days !== days;

  function delta(key: keyof SalesTotals) {
    if (!data) return null;
    const current = data.current[key];
    const previous = data.previous[key];
    if (previous === 0) return <span className="text-muted-foreground">{t("adminSales.noPrevious", { n: data.days })}</span>;
    const percent = Math.round(((current - previous) / previous) * 100);
    if (percent === 0) return <span className="text-muted-foreground">{t("adminSales.noChange", { n: data.days })}</span>;
    const up = percent > 0;
    return (
      <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-exito" : "text-peligro")}>
        {up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
        {t("adminSales.vsPrevious", { delta: `${up ? "+" : ""}${percent} %`, n: data.days })}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <FilterTabs
        options={PERIODS.map((value) => ({ value, label: t("adminSales.days", { n: value }) }))}
        value={days}
        onChange={setDays}
      />

      {error ? <p className="text-sm font-medium text-peligro">{error}</p> : null}

      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className={cn("space-y-6 transition-opacity duration-200", loading && "opacity-60")} aria-busy={loading}>
          {data.toShip > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-aviso/40 bg-aviso/10 p-3 pl-4 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Truck size={16} aria-hidden className="shrink-0" />
                {t("adminSales.toShip", { n: data.toShip })}
              </p>
              <Link href="/admin" className={buttonStyles({ variant: "dark", size: "sm" })}>
                {t("adminSales.goToOrders")}
              </Link>
            </div>
          ) : null}
          {data.toConfirm > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 p-3 pl-4 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Banknote size={16} aria-hidden className="shrink-0" />
                {t("adminSales.toConfirm", { n: data.toConfirm })}
              </p>
              <Link href="/admin" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                {t("adminSales.goToOrders")}
              </Link>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t("adminSales.revenue")} value={formatCOP(data.current.revenue)} hint={t("adminSales.revenueHint")} delta={delta("revenue")} />
            <Kpi label={t("adminSales.orders")} value={String(data.current.orders)} delta={delta("orders")} />
            <Kpi label={t("adminSales.avgTicket")} value={formatCOP(data.current.avgTicket)} delta={delta("avgTicket")} />
            <Kpi label={t("adminSales.units")} value={String(data.current.units)} delta={delta("units")} />
          </div>

          <DailyChart summary={data} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <TopProducts summary={data} />
            <section className="rounded-2xl border border-border bg-surface p-4 shadow-suave sm:p-5">
              <h2 className="text-sm font-bold">{t("adminSales.statuses")}</h2>
              <ul className="mt-3 grid gap-2">
                {STATUSES.map((status) => (
                  <li key={status} className="flex items-center justify-between gap-3 text-sm">
                    <Badge tone={ORDER_STATUS_TONE[status]}>{t(`orderStatus.${status}`)}</Badge>
                    <span className="font-semibold tabular-nums">{data.byStatus[status] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// Barras por día. La altura es proporcional a la venta más alta del periodo;
// cada barra lleva su detalle al pasar el cursor y hay una tabla para lectores de pantalla.
function DailyChart({ summary }: { summary: SalesSummary }) {
  const t = useT();
  const locale = useLocale();
  const max = niceCeil(Math.max(...summary.daily.map((d) => d.revenue), 0));
  const middle = Math.floor((summary.daily.length - 1) / 2);
  const labelEvery = summary.days === 7 ? 1 : summary.days === 30 ? 5 : 15;
  const total = summary.daily.reduce((sum, d) => sum + d.revenue, 0);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-suave sm:p-5">
      <h2 className="text-sm font-bold">{t("adminSales.daily")}</h2>
      <div className="mt-4 flex gap-2">
        {/* Eje: máximo, mitad y cero */}
        <div className="flex h-44 w-14 shrink-0 flex-col justify-between text-right text-[10px] text-muted-foreground tabular-nums">
          <span className="-translate-y-1/2">{formatCompactCOP(max, locale)}</span>
          <span>{formatCompactCOP(max / 2, locale)}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="img"
            aria-label={t("adminSales.dailyLabel", { from: formatDay(summary.from, locale), to: formatDay(summary.to, locale), total: formatCOP(total) })}
            className="relative flex h-44 items-end border-b border-border"
            style={{ gap: summary.days === 90 ? 1 : summary.days === 30 ? 3 : 10 }}
          >
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border" />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
            {summary.daily.map((day) => (
              <div
                key={day.date}
                title={t("adminSales.dayTooltip", { date: formatDay(day.date, locale, true), amount: formatCOP(day.revenue), n: day.orders })}
                className="group relative flex h-full flex-1 items-end"
              >
                <div
                  className={cn(
                    "w-full rounded-t-[3px] bg-accent/80 transition-colors duration-150 group-hover:bg-accent",
                    day.revenue === 0 && "bg-transparent"
                  )}
                  style={{ height: max > 0 ? `${Math.max((day.revenue / max) * 100, day.revenue > 0 ? 2 : 0)}%` : 0 }}
                />
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-1.5 flex text-[10px] text-muted-foreground" style={{ gap: summary.days === 90 ? 1 : summary.days === 30 ? 3 : 10 }}>
            {summary.daily.map((day, index) => (
              <span key={day.date} className="relative flex-1">
                {index % labelEvery === 0 || index === summary.daily.length - 1 ? (
                  // En celular solo caben la primera, la de la mitad y la última.
                  <span
                    className={cn(
                      "absolute whitespace-nowrap",
                      index === 0 ? "left-0" : index === summary.daily.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                      index !== 0 && index !== middle && index !== summary.daily.length - 1 && "hidden sm:block",
                      index === summary.daily.length - 1 && index % labelEvery !== 0 && "sm:hidden"
                    )}
                  >
                    {formatDay(day.date, locale)}
                  </span>
                ) : index === middle ? (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap sm:hidden">{formatDay(day.date, locale)}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{t("adminSales.daily")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("adminSales.date")}</th>
            <th scope="col">{t("adminSales.revenue")}</th>
            <th scope="col">{t("adminSales.orders")}</th>
          </tr>
        </thead>
        <tbody>
          {summary.daily.map((day) => (
            <tr key={day.date}>
              <td>{formatDay(day.date, locale, true)}</td>
              <td>{formatCOP(day.revenue)}</td>
              <td>{day.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-4" />
    </section>
  );
}

function TopProducts({ summary }: { summary: SalesSummary }) {
  const t = useT();
  const maxUnits = Math.max(...summary.topProducts.map((p) => p.units), 1);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-suave sm:p-5">
      <h2 className="text-sm font-bold">{t("adminSales.top")}</h2>
      {summary.topProducts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("adminSales.topEmpty")}</p>
      ) : (
        <ol className="mt-3 grid gap-3">
          {summary.topProducts.map((product) => (
            <li key={product.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{product.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t("adminSales.topUnits", { n: product.units })} · {formatCOP(product.revenue)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent/80" style={{ width: `${(product.units / maxUnits) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
