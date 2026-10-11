"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

/** "1–20 de 45" con Anterior y Siguiente. No se muestra si todo cabe en una página. */
export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const t = useT();
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <p className="text-sm text-muted-foreground tabular-nums">{t("common.showing", { from, to, total })}</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft aria-hidden />
          {t("common.previous")}
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => onChange(page + 1)}>
          {t("common.next")}
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
