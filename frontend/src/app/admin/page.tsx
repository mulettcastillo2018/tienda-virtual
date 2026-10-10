"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT } from "@/lib/i18n";
import { ORDER_STATUS_TONE } from "@/lib/statusTones";
import { Badge } from "@/components/ui/Badge";
import type { Order } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

export default function AdminOrdersPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  async function loadOrders() {
    if (!token) return;
    const data = await apiFetch<Order[]>("/orders", { token });
    setOrders(data);
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleDispatch(orderId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const carrier = (form.elements.namedItem("carrier") as HTMLInputElement).value;
    const trackingNumber = (form.elements.namedItem("trackingNumber") as HTMLInputElement).value;

    setError(null);
    try {
      await apiFetch(`/orders/${orderId}/dispatch`, {
        method: "POST",
        token,
        body: JSON.stringify({ carrier, trackingNumber }),
      });
      setDispatching(null);
      await loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminOrders.dispatchError"));
    }
  }

  async function handleResolve(orderId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = (event.currentTarget.elements.namedItem("note") as HTMLInputElement).value;
    setError(null);
    try {
      await apiFetch(`/orders/${orderId}/review-resolved`, { method: "POST", token, body: JSON.stringify({ note }) });
      setResolving(null);
      showToast(t("adminOrders.reviewResolvedToast"));
      await loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminOrders.reviewResolveError"));
    }
  }

  const pendingReview = orders.filter((o) => o.needsReview).length;

  return (
    <div className="space-y-4">
      {pendingReview > 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-aviso/40 bg-aviso/10 p-3 text-sm text-foreground">
          <AlertTriangle size={16} className="shrink-0" />
          {t("adminOrders.reviewBanner", { n: pendingReview })}
        </p>
      ) : null}
      {error ? <p className="text-sm text-peligro font-medium">{error}</p> : null}

      {orders.map((order) => {
        const lastPayment = order.payments?.[0];
        return (
          <div
            key={order.id}
            className={`rounded-2xl border bg-surface p-4 shadow-suave sm:p-5 ${order.needsReview ? "border-aviso/40" : "border-border"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">#{order.id}</p>
              <Badge tone={ORDER_STATUS_TONE[order.status]}>{t(`orderStatus.${order.status}`)}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {order.user?.email ? `${order.user.email} · ` : ""}
              {order.shippingAddress?.fullName} — {order.shippingAddress?.city}, {order.shippingAddress?.state}
            </p>
            <p className="mt-1 text-sm">{t("adminOrders.total", { amount: formatCOP(order.totalAmount) })}</p>
            {lastPayment ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("adminOrders.lastPayment", {
                  status: t(`paymentStatus.${lastPayment.status}`),
                  method: lastPayment.paymentMethod ?? "—",
                  count: order.payments?.length ?? 0,
                })}
              </p>
            ) : null}

            {order.needsReview ? (
              <div className="mt-3 rounded-lg bg-aviso/10 p-3 text-sm text-foreground">
                <p className="font-semibold">{t("adminOrders.needsReview")}</p>
                <p className="mt-1 whitespace-pre-line text-xs">{order.reviewNote}</p>
                {resolving === order.id ? (
                  <form onSubmit={(e) => handleResolve(order.id, e)} className="mt-2 flex flex-wrap gap-2">
                    <input
                      name="note"
                      required
                      minLength={3}
                      placeholder={t("adminOrders.resolutionPlaceholder")}
                      className="min-w-0 flex-1 rounded-xl border border-border bg-background px-2.5 h-9 text-sm text-foreground"
                    />
                    <button type="submit" className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                      {t("adminOrders.markResolved")}
                    </button>
                  </form>
                ) : (
                  <button onClick={() => setResolving(order.id)} className="mt-2 text-xs font-semibold underline">
                    {t("adminOrders.resolve")}
                  </button>
                )}
              </div>
            ) : null}

            {order.status === "PAID" || order.status === "PROCESSING" ? (
              dispatching === order.id ? (
                <form onSubmit={(e) => handleDispatch(order.id, e)} className="mt-3 flex flex-wrap gap-2">
                  <input name="carrier" placeholder={t("adminOrders.carrier")} required className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
                  <input name="trackingNumber" placeholder={t("adminOrders.trackingNumber")} required className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
                  <button type="submit" className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                    {t("adminOrders.confirmDispatch")}
                  </button>
                </form>
              ) : (
                <button onClick={() => setDispatching(order.id)} className="mt-3 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
                  {t("adminOrders.markDispatched")}
                </button>
              )
            ) : order.trackingNumber ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("adminOrders.shippedBy", { carrier: order.carrier ?? "", tracking: order.trackingNumber })}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
