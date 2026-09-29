"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT } from "@/lib/i18n";
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
        <p className="flex items-center gap-2 rounded-xl border border-amber-500 bg-amber-500/10 p-3 text-sm text-foreground">
          <AlertTriangle size={16} className="shrink-0" />
          {t("adminOrders.reviewBanner", { n: pendingReview })}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {orders.map((order) => {
        const lastPayment = order.payments?.[0];
        return (
          <div key={order.id} className={`rounded-xl border p-4 ${order.needsReview ? "border-amber-500" : "border-border"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">#{order.id}</p>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t(`orderStatus.${order.status}`)}</span>
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
              <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-foreground">
                <p className="font-semibold">{t("adminOrders.needsReview")}</p>
                <p className="mt-1 whitespace-pre-line text-xs">{order.reviewNote}</p>
                {resolving === order.id ? (
                  <form onSubmit={(e) => handleResolve(order.id, e)} className="mt-2 flex flex-wrap gap-2">
                    <input
                      name="note"
                      required
                      minLength={3}
                      placeholder={t("adminOrders.resolutionPlaceholder")}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
                    />
                    <button type="submit" className="btn-primary rounded-full px-4 py-1 text-sm">
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
                  <input name="carrier" placeholder={t("adminOrders.carrier")} required className="rounded-lg border border-border px-2 py-1 text-sm" />
                  <input name="trackingNumber" placeholder={t("adminOrders.trackingNumber")} required className="rounded-lg border border-border px-2 py-1 text-sm" />
                  <button type="submit" className="btn-primary rounded-full px-4 py-1 text-sm">
                    {t("adminOrders.confirmDispatch")}
                  </button>
                </form>
              ) : (
                <button onClick={() => setDispatching(order.id)} className="mt-3 text-sm font-semibold text-accent">
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
