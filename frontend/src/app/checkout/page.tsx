"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { AddressForm, type AddressFormValues } from "@/components/AddressForm";
import { getEffectivePrice } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import type { Order, ShippingAddress } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

type Step = "address" | "summary";

export default function CheckoutPage() {
  const [step, setStep] = useState<Step>("address");
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [address, setAddress] = useState<ShippingAddress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = useAuthStore((state) => state.token);
  const cart = useCartStore((state) => state.cart);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    apiFetch<ShippingAddress[]>("/addresses", { token })
      .then((data) => {
        setAddresses(data);
        setShowNewAddressForm(data.length === 0);
      })
      .catch(() => setError(t("checkout.loadAddressesError")))
      .finally(() => setLoadingAddresses(false));
  }, [token]);

  if (!token) {
    return null;
  }

  function handleUseSelectedAddress() {
    const selected = addresses.find((a) => a.id === selectedAddressId);
    if (!selected) return;
    setAddress(selected);
    setStep("summary");
  }

  async function handleNewAddressSubmit(values: AddressFormValues) {
    setError(null);
    setLoading(true);
    try {
      const created = await apiFetch<ShippingAddress>("/addresses", {
        method: "POST",
        token,
        body: JSON.stringify(values),
      });
      setAddress(created);
      setStep("summary");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checkout.saveAddressError"));
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
      // El pedido queda reservado y el carrito vacío: el pago (y sus
      // reintentos) se hace en la página de resultado.
      fetchCart();
      router.push(`/checkout/result?orderId=${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checkout.createOrderError"));
    } finally {
      setLoading(false);
    }
  }

  const subtotal = cart?.items.reduce((sum, item) => sum + getEffectivePrice(item.product) * item.quantity, 0) ?? 0;

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">{t("checkout.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("checkout.step", { n: step === "address" ? "1" : "2" })}
      </p>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {step === "address" ? (
        <div className="mt-6 space-y-4">
          {loadingAddresses ? <p className="text-sm text-muted-foreground">{t("checkout.loadingAddresses")}</p> : null}

          {!loadingAddresses && addresses.length > 0 ? (
            <div className="space-y-2">
              {addresses.map((a) => (
                <label
                  key={a.id}
                  className={`block cursor-pointer rounded-xl border p-4 text-sm ${
                    selectedAddressId === a.id ? "border-accent" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="savedAddress"
                      checked={selectedAddressId === a.id}
                      onChange={() => setSelectedAddressId(a.id)}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-semibold">{a.fullName}</p>
                      <p className="text-muted-foreground">
                        {a.addressLine1}
                        {a.addressLine2 ? `, ${a.addressLine2}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {a.city}, {a.state}
                      </p>
                    </div>
                  </div>
                </label>
              ))}

              {!showNewAddressForm ? (
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleUseSelectedAddress}
                    disabled={!selectedAddressId}
                    className="btn-primary w-full rounded-full px-6 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("checkout.continueWithAddress")}
                  </button>
                  <button
                    onClick={() => setShowNewAddressForm(true)}
                    className="text-sm font-semibold text-accent"
                  >
                    {t("checkout.useNewAddress")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {showNewAddressForm ? (
            <AddressForm submitLabel={t("checkout.continue")} loading={loading} onSubmit={handleNewAddressSubmit} />
          ) : null}
        </div>
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
            <span className="text-muted-foreground">{t("checkout.subtotal")}</span>
            <span>{formatCOP(subtotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("checkout.shippingNote")}</p>
          <button
            onClick={handleConfirmOrder}
            disabled={loading}
            className="btn-primary w-full rounded-full px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t("checkout.creatingOrder") : t("checkout.confirmAndPay")}
          </button>
        </div>
      ) : null}

    </div>
  );
}
