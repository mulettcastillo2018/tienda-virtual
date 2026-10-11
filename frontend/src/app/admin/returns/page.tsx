"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputStyles } from "@/components/ui/Field";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Pagination } from "@/components/ui/Pagination";
import type { AdminReturn, ReturnStatus } from "@/lib/types";

const PAGE_SIZE = 20;
const STATUSES: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED"];
const TONE: Record<ReturnStatus, BadgeTone> = { REQUESTED: "warning", APPROVED: "neutral", RECEIVED: "neutral", REFUNDED: "success", REJECTED: "danger" };

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

type Action = { id: string; kind: "approve" | "reject" | "refund" };

// Retracto y reversión del pago: la tienda revisa, recibe el producto y reembolsa.
export default function AdminReturnsPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<ReturnStatus | "ALL">("REQUESTED");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = usePagedList<{ items: AdminReturn[]; total: number; counts: Partial<Record<ReturnStatus | "ALL", number>> }>(
    "/returns",
    { page, pageSize: PAGE_SIZE, status: tab === "ALL" ? undefined : tab },
    t("adminReturns.loadError")
  );
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  async function run(id: string, path: string, body: object, toast: string) {
    setError(null);
    setBusy(id);
    try {
      await apiFetch(`/returns/${id}/${path}`, { method: "POST", token, body: JSON.stringify(body) });
      setAction(null);
      showToast(t(toast));
      list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminReturns.actionError"));
    } finally {
      setBusy(null);
    }
  }

  function handleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const value = (event.currentTarget.elements.namedItem("value") as HTMLInputElement).value.trim();
    if (action.kind === "refund") return run(action.id, "refund", { reference: value }, "adminReturns.refundedToast");
    if (action.kind === "reject") return run(action.id, "reject", { note: value }, "adminReturns.rejectedToast");
    return run(action.id, "approve", { note: value || null }, "adminReturns.approvedToast");
  }

  const counts = list.data?.counts ?? {};
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("adminReturns.hint")}</p>
      <FilterTabs
        options={[
          ...STATUSES.map((value) => ({ value, label: t(`afterSales.status.${value}`), count: counts[value] ?? 0 })),
          { value: "ALL" as const, label: t("adminReturns.all"), count: counts.ALL ?? 0 },
        ]}
        value={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
        }}
      />
      {error || list.error ? <p className="text-sm font-medium text-peligro">{error ?? list.error}</p> : null}
      {list.data && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("adminReturns.empty")}</p>
      ) : null}

      {items.map((request) => {
        const email = request.order.user?.email ?? request.order.guestEmail;
        const payment = request.order.payments[0];
        const formOpen = action?.id === request.id;
        return (
          <div key={request.id} className="rounded-2xl border border-border bg-surface p-4 shadow-suave sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {t(`afterSales.type.${request.type}`)} · #{request.order.id.slice(-8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("adminReturns.requestedOn", { date: date(request.createdAt) })} · {t("adminReturns.deadline", { date: date(request.deadlineAt) })}
                </p>
              </div>
              <Badge tone={TONE[request.status]}>{t(`afterSales.status.${request.status}`)}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {request.order.shippingFullName} · {email} · {request.order.shippingPhone}
            </p>
            <p className="mt-1 text-sm">
              {formatCOP(request.order.totalAmount)} ·{" "}
              {request.order.paymentOption === "CASH_ON_DELIVERY"
                ? t("adminOrders.cod")
                : t("adminReturns.paidWith", { method: payment?.paymentMethod ?? "—", transaction: payment?.providerTransactionId ?? "—" })}
            </p>
            {request.cause ? <p className="mt-1 text-sm font-medium">{t(`afterSales.cause.${request.cause}`)}</p> : null}
            {request.customerNote ? <p className="mt-1 text-sm italic text-muted-foreground">“{request.customerNote}”</p> : null}
            {request.storeNote ? <p className="mt-1 text-sm">{t("adminReturns.storeNote", { note: request.storeNote })}</p> : null}
            {request.refundReference ? <p className="mt-1 text-sm text-muted-foreground">{t("afterSales.refundReference", { reference: request.refundReference })}</p> : null}

            {formOpen ? (
              <form onSubmit={handleForm} className="mt-3 flex flex-wrap gap-2">
                <input
                  name="value"
                  required={action.kind !== "approve"}
                  minLength={action.kind === "approve" ? undefined : 3}
                  maxLength={500}
                  placeholder={t(`adminReturns.placeholder.${action.kind}`)}
                  className={cn(inputStyles, "h-9 min-w-0 flex-1 px-2.5")}
                />
                <Button type="submit" variant={action.kind === "reject" ? "danger" : "dark"} size="sm" loading={busy === request.id}>
                  {t(`adminReturns.confirm.${action.kind}`)}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAction(null)}>
                  {t("common.cancel")}
                </Button>
              </form>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {request.status === "REQUESTED" ? (
                  <>
                    <Button variant="dark" size="sm" onClick={() => setAction({ id: request.id, kind: "approve" })}>
                      {t("adminReturns.approve")}
                    </Button>
                    <Button variant="ghost" size="sm" className="hover:text-peligro" onClick={() => setAction({ id: request.id, kind: "reject" })}>
                      {t("adminReturns.reject")}
                    </Button>
                  </>
                ) : null}
                {request.status === "APPROVED" ? (
                  <Button variant="secondary" size="sm" loading={busy === request.id} onClick={() => run(request.id, "receive", {}, "adminReturns.receivedToast")}>
                    {t("adminReturns.receive")}
                  </Button>
                ) : null}
                {request.status === "APPROVED" || request.status === "RECEIVED" ? (
                  <Button variant="dark" size="sm" onClick={() => setAction({ id: request.id, kind: "refund" })}>
                    {t("adminReturns.refund")}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
