"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { isDiscountActive } from "@/lib/pricing";
import { useT, useLocale } from "@/lib/i18n";
import type { Product, ProductDiscountLog } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

function formatDate(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium" }).format(new Date(iso));
}

function formatDateTime(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}

interface Draft {
  percentage: string;
  durationDays: string;
}

export default function AdminDiscountsPage() {
  const token = useAuthStore((state) => state.token);
  const [products, setProducts] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<ProductDiscountLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const t = useT();
  const locale = useLocale();

  async function loadProducts() {
    if (!token) return;
    const data = await apiFetch<{ items: Product[] }>("/products?pageSize=100", { token });
    setProducts(data.items);
    setDrafts(
      Object.fromEntries(
        data.items.map((p) => [
          p.id,
          { percentage: p.discountPercentage ? String(p.discountPercentage) : "", durationDays: "" },
        ])
      )
    );
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function updateDraft(productId: string, field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [productId]: { ...prev[productId], [field]: value } }));
  }

  async function toggleHistory(productId: string) {
    if (historyOpenId === productId) {
      setHistoryOpenId(null);
      return;
    }
    if (!token) return;
    setHistoryOpenId(productId);
    setLoadingHistory(true);
    try {
      const data = await apiFetch<ProductDiscountLog[]>(`/products/${productId}/discount-logs`, { token });
      setHistory(data);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleSave(product: Product) {
    if (!token) return;
    const draft = drafts[product.id] ?? { percentage: "", durationDays: "" };
    const discountPercentage = draft.percentage === "" ? null : Number(draft.percentage);
    const discountDurationDays = draft.durationDays === "" ? null : Number(draft.durationDays);

    if (discountPercentage !== null && (discountPercentage < 1 || discountPercentage > 99 || !Number.isInteger(discountPercentage))) {
      setError(t("adminDiscounts.percentRangeError"));
      return;
    }
    if (discountPercentage !== null && !isDiscountActive(product) && !discountDurationDays) {
      setError(t("adminDiscounts.durationRequiredError", { name: product.name }));
      return;
    }

    setError(null);
    setSavingId(product.id);
    try {
      await apiFetch(`/products/${product.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ discountPercentage, discountDurationDays }),
      });
      await loadProducts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminDiscounts.saveError"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("adminDiscounts.hint")}</p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {products.map((product) => {
          const draft = drafts[product.id] ?? { percentage: "", durationDays: "" };
          const previewPercentage = draft.percentage === "" ? null : Number(draft.percentage);
          const previewPrice =
            previewPercentage && previewPercentage >= 1 && previewPercentage <= 99
              ? Math.round(product.price * (1 - previewPercentage / 100))
              : null;
          const active = isDiscountActive(product);
          const expired = Boolean(product.discountPercentage) && !active;

          return (
            <div key={product.id} className="rounded-xl border border-border p-3 text-center">
              <div className="product-media relative mx-auto aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {product.images[0] ? (
                  <Image src={product.images[0]} alt={product.name} fill sizes="150px" className="object-cover" />
                ) : null}
              </div>

              <p className="mt-2 line-clamp-2 text-sm font-semibold">{product.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatCOP(product.price)}
                {previewPrice !== null ? (
                  <>
                    {" "}
                    → <span className="font-semibold text-foreground">{formatCOP(previewPrice)}</span>
                  </>
                ) : null}
              </p>

              <p className="mt-1 text-xs">
                {active ? (
                  <span className="text-accent">{t("adminDiscounts.activeUntil", { date: formatDate(product.discountEndsAt!, locale) })}</span>
                ) : expired ? (
                  <span className="text-muted-foreground">{t("adminDiscounts.expired")}</span>
                ) : (
                  <span className="text-muted-foreground">{t("adminDiscounts.none")}</span>
                )}
              </p>

              <div className="mt-2 space-y-1.5">
                <input
                  type="number"
                  min={1}
                  max={99}
                  placeholder={t("adminDiscounts.percentPlaceholder")}
                  value={draft.percentage}
                  onChange={(e) => updateDraft(product.id, "percentage", e.target.value)}
                  className="w-full rounded-lg border border-border px-2 py-1 text-center text-sm"
                />
                <input
                  type="number"
                  min={1}
                  placeholder={t("adminDiscounts.durationPlaceholder")}
                  value={draft.durationDays}
                  onChange={(e) => updateDraft(product.id, "durationDays", e.target.value)}
                  className="w-full rounded-lg border border-border px-2 py-1 text-center text-sm"
                />
                <button
                  onClick={() => handleSave(product)}
                  disabled={savingId === product.id}
                  className="btn-primary w-full rounded-full px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingId === product.id ? t("adminDiscounts.saving") : t("adminDiscounts.save")}
                </button>
                <button
                  onClick={() => toggleHistory(product.id)}
                  className="w-full text-xs font-semibold text-accent underline"
                >
                  {historyOpenId === product.id ? t("adminDiscounts.hideHistory") : t("adminDiscounts.viewHistory")}
                </button>
              </div>

              {historyOpenId === product.id ? (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-left">
                  {loadingHistory ? (
                    <p className="text-xs text-muted-foreground">{t("adminDiscounts.loading")}</p>
                  ) : history.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("adminDiscounts.noHistory")}</p>
                  ) : (
                    history.map((log) => (
                      <p key={log.id} className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">-{log.discountPercentage}%</span>{" "}
                        {formatDateTime(log.startedAt, locale)} → {formatDateTime(log.endsAt, locale)}
                        <br />
                        {t("adminDiscounts.by", { email: log.createdBy.email })}
                      </p>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
