"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { PqrsStats, PqrsStatus, PqrsType } from "@/lib/types";

const PQRS_TYPES: PqrsType[] = ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"];
const PQRS_STATUSES: PqrsStatus[] = ["RECIBIDO", "EN_PROCESO", "RESUELTO", "CERRADO"];

export default function AdminPqrsPage() {
  const token = useAuthStore((state) => state.token);
  const [stats, setStats] = useState<PqrsStats | null>(null);
  const t = useT();

  useEffect(() => {
    if (!token) return;
    apiFetch<PqrsStats>("/pqrs/stats", { token }).then(setStats);
  }, [token]);

  if (!stats) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">{t("adminPqrsStats.readOnlyHint")}</p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-extrabold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">{t("adminPqrsStats.total")}</p>
        </div>
        <div className="rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-extrabold">
            {stats.avgResponseTimeHours !== null ? stats.avgResponseTimeHours.toFixed(1) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{t("adminPqrsStats.avgResponseHours")}</p>
        </div>
        <div className={`rounded-xl border p-4 text-center ${stats.overdue > 0 ? "border-red-600" : "border-border"}`}>
          <p className={`text-2xl font-extrabold ${stats.overdue > 0 ? "text-red-600" : ""}`}>{stats.overdue}</p>
          <p className="text-xs text-muted-foreground">{t("adminPqrsStats.overdue")}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold">{t("adminPqrsStats.byStatus")}</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PQRS_STATUSES.map((value) => (
            <div key={value} className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-bold">{stats.byStatus[value] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{t(`pqrsStatus.${value}`)}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold">{t("adminPqrsStats.byType")}</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PQRS_TYPES.map((value) => (
            <div key={value} className="rounded-xl border border-border p-3 text-center">
              <p className="text-xl font-bold">{stats.byType[value] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{t(`pqrsType.${value}`)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
