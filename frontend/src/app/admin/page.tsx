"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import type { Order } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

export default function AdminOrdersPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dispatching, setDispatching] = useState<string | null>(null);

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
      alert(err instanceof ApiError ? err.message : "No se pudo despachar la orden.");
    }
  }

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">Esta sección es solo para administradores.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Órdenes</h1>

      <div className="mt-6 space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">#{order.id}</p>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{order.status}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {order.shippingAddress?.fullName} — {order.shippingAddress?.city}, {order.shippingAddress?.state}
            </p>
            <p className="mt-1 text-sm">Total: {formatCOP(order.totalAmount)}</p>

            {order.status === "PAID" || order.status === "PROCESSING" ? (
              dispatching === order.id ? (
                <form onSubmit={(e) => handleDispatch(order.id, e)} className="mt-3 flex flex-wrap gap-2">
                  <input name="carrier" placeholder="Transportadora" required className="rounded-lg border border-border px-2 py-1 text-sm" />
                  <input name="trackingNumber" placeholder="Número de guía" required className="rounded-lg border border-border px-2 py-1 text-sm" />
                  <button type="submit" className="btn-primary rounded-full px-4 py-1 text-sm">
                    Confirmar despacho
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setDispatching(order.id)}
                  className="mt-3 text-sm font-semibold text-accent"
                >
                  Marcar como despachado
                </button>
              )
            ) : order.trackingNumber ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Enviado por {order.carrier} — guía {order.trackingNumber}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
