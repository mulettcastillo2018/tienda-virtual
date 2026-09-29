"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { Order } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

export default function AdminOrdersPage() {
  const token = useAuthStore((state) => state.token);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dispatching, setDispatching] = useState<string | null>(null);
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

    try {
      await apiFetch(`/orders/${orderId}/dispatch`, {
        method: "POST",
        token,
        body: JSON.stringify({ carrier, trackingNumber }),
      });
      setDispatching(null);
      await loadOrders();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : t("adminOrders.dispatchError"));
    }
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div key={order.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">#{order.id}</p>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{t(`orderStatus.${order.status}`)}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.shippingAddress?.fullName} — {order.shippingAddress?.city}, {order.shippingAddress?.state}
          </p>
          <p className="mt-1 text-sm">{t("adminOrders.total", { amount: formatCOP(order.totalAmount) })}</p>

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
              <button
                onClick={() => setDispatching(order.id)}
                className="mt-3 text-sm font-semibold text-accent"
              >
                {t("adminOrders.markDispatched")}
              </button>
            )
          ) : order.trackingNumber ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("adminOrders.shippedBy", { carrier: order.carrier ?? "", tracking: order.trackingNumber })}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
