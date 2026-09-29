"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { useT } from "@/lib/i18n";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

export default function CartPage() {
  const token = useAuthStore((state) => state.token);
  const router = useRouter();
  const { cart, fetchCart, updateItem, removeItem, clearCart } = useCartStore();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const t = useT();

  async function handleClearCart() {
    setClearing(true);
    try {
      await clearCart();
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetchCart();
  }, [token, fetchCart]);

  if (!token) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p>{t("cart.loginRequired")}</p>
        <Link href="/login" className="mt-4 inline-block font-semibold text-accent">
          {t("cart.login")}
        </Link>
      </div>
    );
  }

  const items = cart?.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + getEffectivePrice(item.product) * item.quantity, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("cart.title")}</h1>
        {items.length > 0 ? (
          confirmingClear ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("cart.confirmClear")}</span>
              <button
                onClick={handleClearCart}
                disabled={clearing}
                className="font-semibold text-red-600 disabled:opacity-50"
              >
                {clearing ? t("cart.clearing") : t("cart.yes")}
              </button>
              <button
                onClick={() => setConfirmingClear(false)}
                disabled={clearing}
                className="font-semibold text-muted-foreground"
              >
                {t("cart.no")}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmingClear(true)} className="text-sm font-semibold text-red-600">
              {t("cart.clearCart")}
            </button>
          )
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-muted-foreground">{t("cart.empty")}</p>
      ) : (
        <div className="mt-6 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 rounded-xl border border-border p-4">
              <div className="h-16 w-16 shrink-0 rounded-lg bg-muted" />
              <div className="flex-1">
                <p className="font-semibold">{item.product.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCOP(getEffectivePrice(item.product))}
                  {isDiscountActive(item.product) ? (
                    <span className="ml-2 line-through">{formatCOP(item.product.price)}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateItem(item.productId, Math.max(1, item.quantity - 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center">{item.quantity}</span>
                <button
                  onClick={() => updateItem(item.productId, item.quantity + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-border"
                >
                  <Plus size={14} />
                </button>
              </div>
              <button onClick={() => removeItem(item.productId)} className="text-muted-foreground hover:text-red-600">
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-muted-foreground">{t("cart.subtotal")}</span>
            <span className="text-xl font-bold">{formatCOP(subtotal)}</span>
          </div>

          <button
            onClick={() => router.push("/checkout")}
            className="btn-primary w-full rounded-full px-6 py-3"
          >
            {t("cart.continueToPayment")}
          </button>
        </div>
      )}
    </div>
  );
}
