"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { WompiButton } from "@/components/WompiButton";
import type { Order, ShippingAddress } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

type Step = "address" | "summary" | "pay";

export default function CheckoutPage() {
  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = useAuthStore((state) => state.token);
  const cart = useCartStore((state) => state.cart);
  const router = useRouter();

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  if (!token) {
    return null;
  }

  async function handleAddressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;

    try {
      const created = await apiFetch<ShippingAddress>("/addresses", {
        method: "POST",
        token,
        body: JSON.stringify({
          fullName: field("fullName"),
          addressLine1: field("addressLine1"),
          city: field("city"),
          state: field("state"),
          postalCode: field("postalCode"),
          phone: field("phone"),
        }),
      });
      setAddress(created);
      setStep("summary");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la dirección.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmOrder() {
    if (!address) return;
    setError(null);
    setLoading(true);
    try {
      const created = await apiFetch<Order>("/orders/checkout", {
        method: "POST",
        token,
        body: JSON.stringify({ shippingAddressId: address.id }),
      });
      setOrder(created);
      setStep("pay");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la orden.");
    } finally {
      setLoading(false);
    }
  }

  const subtotal = cart?.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0) ?? 0;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Paso {step === "address" ? "1" : step === "summary" ? "2" : "3"} de 3
      </p>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {step === "address" ? (
        <form onSubmit={handleAddressSubmit} className="mt-6 space-y-4">
          <input name="fullName" placeholder="Nombre completo" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          <input name="addressLine1" placeholder="Dirección" required className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input name="city" placeholder="Ciudad" required className="rounded-lg border border-border px-3 py-2 text-sm" />
            <input name="state" placeholder="Departamento" required className="rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input name="postalCode" placeholder="Código postal" required className="rounded-lg border border-border px-3 py-2 text-sm" />
            <input name="phone" placeholder="Teléfono" required className="rounded-lg border border-border px-3 py-2 text-sm" />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full rounded-full px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Guardando…" : "Continuar"}
          </button>
        </form>
      ) : null}

      {step === "summary" ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-border p-4 text-sm">
            <p className="font-semibold">{address?.fullName}</p>
            <p>{address?.addressLine1}</p>
            <p>
              {address?.city}, {address?.state}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCOP(subtotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            El costo de envío se calcula al confirmar, según tu ciudad y el peso del pedido.
          </p>
          <button
            onClick={handleConfirmOrder}
            disabled={loading}
            className="btn-primary w-full rounded-full px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Creando orden…" : "Confirmar y pagar"}
          </button>
        </div>
      ) : null}

      {step === "pay" && order ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-muted-foreground">Envío</span>
            <span>{formatCOP(order.shippingCost)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatCOP(order.totalAmount)}</span>
          </div>
          <WompiButton orderId={order.id} />
        </div>
      ) : null}
    </div>
  );
}
