"use client";

import { Check, XCircle } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Order, OrderStatus } from "@/lib/types";

// Lo que pasa con un pedido después de pagarlo.
const STEPS: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

function formatDate(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium" }).format(new Date(iso));
}

/** En qué va un pedido pagado, con la fecha de cada paso. Un pedido sin pagar no muestra nada. */
export function OrderProgress({ order }: { order: Pick<Order, "status" | "timeline"> }) {
  const t = useT();
  const locale = useLocale();
  const timeline = order.timeline ?? [];

  if (order.status === "CANCELLED") {
    const cancelled = timeline.findLast((entry) => entry.status === "CANCELLED");
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <XCircle size={16} aria-hidden className="shrink-0" />
        {cancelled ? t("account.cancelledOn", { date: formatDate(cancelled.at, locale) }) : t("orderStatus.CANCELLED")}
      </p>
    );
  }

  const current = STEPS.indexOf(order.status);
  if (current === -1) return null;

  return (
    <ol aria-label={t("account.progressLabel")} className="flex items-start">
      {STEPS.map((status, index) => {
        const reached = index <= current;
        const isCurrent = index === current;
        // Un pedido puede despacharse sin pasar por "en preparación": ese paso queda sin fecha.
        const entry = timeline.find((item) => item.status === status);
        return (
          <li key={status} aria-current={isCurrent ? "step" : undefined} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={cn("h-0.5 flex-1", index === 0 ? "opacity-0" : reached ? "bg-exito" : "bg-border")} />
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                  isCurrent
                    ? "border-foreground bg-foreground text-background"
                    : reached
                      ? "border-exito bg-exito text-white dark:text-background"
                      : "border-border text-muted-foreground"
                )}
              >
                {reached && !isCurrent ? <Check size={14} strokeWidth={3} aria-hidden /> : index + 1}
              </div>
              <div
                className={cn("h-0.5 flex-1", index === STEPS.length - 1 ? "opacity-0" : index < current ? "bg-exito" : "bg-border")}
              />
            </div>
            <p className={cn("mt-1.5 text-xs font-semibold", isCurrent ? "text-foreground" : "text-muted-foreground")}>
              {t(`orderStatus.${status}`)}
            </p>
            <p className="text-[11px] text-muted-foreground">{entry && reached ? formatDate(entry.at, locale) : "—"}</p>
          </li>
        );
      })}
    </ol>
  );
}
