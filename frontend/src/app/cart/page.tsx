"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Minus, Plus, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { useToastStore } from "@/store/toast.store";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { magnetic } from "@/lib/magnetic";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

const stepButton =
  "flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-35";

// Mismo tope por producto que el backend.
const MAX_PER_PRODUCT = 99;

export default function CartPage() {
  const token = useAuthStore((state) => state.token);
  const router = useRouter();
  const { cart, fetchCart, updateItem, removeItem, clearCart } = useCartStore();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const showToast = useToastStore((state) => state.show);
  const t = useT();

  // Si el servidor rechaza un cambio (se agotó, lo desactivaron), se dice por qué
  // y se vuelve a leer el carrito para mostrarlo como está.
  async function change(action: () => Promise<void>) {
    try {
      await action();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("cart.updateError"));
      fetchCart().catch(() => {});
    }
  }

  async function handleClearCart() {
    setClearing(true);
    try {
      await clearCart();
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

  // Con o sin sesión: sin sesión es el carrito guardado en el navegador.
  useEffect(() => {
    fetchCart().catch(() => {});
  }, [token, fetchCart]);

  const items = cart?.items ?? [];
  const subtotal = items.reduce((sum, item) => sum + getEffectivePrice(item.product) * item.quantity, 0);
  const blocked = items.some((item) => item.issue);

  return (
    // En celular se deja espacio abajo para la barra fija de pago.
    <Container className={cn("max-w-6xl pt-6 pb-16 sm:pt-10", items.length > 0 && "pb-28 md:pb-16")}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-1">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("cart.title")}</h1>
          {items.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length === 1 ? t("home.resultsCountOne") : t("home.resultsCount", { count: items.length })}
            </p>
          ) : null}
        </div>
        {items.length > 0 ? (
          confirmingClear ? (
            <div className="animate-emerger flex items-center gap-1 rounded-full border border-border bg-surface py-1 pr-1 pl-4 text-sm shadow-suave">
              <span className="mr-1 text-muted-foreground">{t("cart.confirmClear")}</span>
              <Button variant="danger" size="sm" onClick={handleClearCart} loading={clearing}>
                {clearing ? t("cart.clearing") : t("cart.yes")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(false)} disabled={clearing}>
                {t("cart.no")}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmingClear(true)} className="hover:text-peligro">
              <Trash2 />
              {t("cart.clearCart")}
            </Button>
          )
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-[2rem] border border-dashed border-border px-6 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
            <ShoppingBag size={28} aria-hidden />
          </span>
          <p className="mt-5 text-muted-foreground">{t("cart.empty")}</p>
          <Link href="/" className={cn(buttonStyles({ variant: "dark" }), "mt-6")}>
            {t("paymentResult.keepShopping")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
          <ul className="grid gap-3">
            {items.map((item) => {
              const unitPrice = getEffectivePrice(item.product);
              const gone = item.issue === "INACTIVE" || item.issue === "OUT_OF_STOCK";
              const atMax = item.quantity >= Math.min(item.product.stock, MAX_PER_PRODUCT);
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex gap-3 rounded-3xl border bg-surface p-3 shadow-suave sm:gap-5 sm:p-4",
                    gone ? "border-peligro/40" : item.issue ? "border-aviso/50" : "border-border"
                  )}
                >
                  <Link
                    href={`/products/${item.productId}`}
                    className={cn("product-media relative size-24 shrink-0 overflow-hidden rounded-2xl sm:size-28", gone && "opacity-50 grayscale")}
                  >
                    {item.product.images[0] ? (
                      <Image src={item.product.images[0]} alt={item.product.name} fill sizes="112px" className="object-cover" />
                    ) : null}
                  </Link>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${item.productId}`}
                          className="line-clamp-2 leading-snug font-semibold transition-colors hover:text-accent"
                        >
                          {item.product.name}
                        </Link>
                        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground tabular-nums">
                          <span className={cn(isDiscountActive(item.product) && "font-semibold text-accent")}>{formatCOP(unitPrice)}</span>
                          {isDiscountActive(item.product) ? <span className="text-xs line-through">{formatCOP(item.product.price)}</span> : null}
                        </p>
                      </div>
                      <button
                        onClick={() => change(() => removeItem(item.productId))}
                        aria-label={t("cart.remove")}
                        title={t("cart.remove")}
                        className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-peligro/10 hover:text-peligro"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>

                    {item.issue ? (
                      <p className={cn("mt-2 flex items-start gap-1.5 text-xs font-medium", gone ? "text-peligro" : "text-aviso")}>
                        <AlertTriangle size={14} aria-hidden className="mt-px shrink-0" />
                        <span>
                          {item.issue === "INACTIVE"
                            ? t("cart.issueInactive")
                            : item.issue === "OUT_OF_STOCK"
                              ? t("cart.issueOutOfStock")
                              : t("cart.issueNotEnough", { n: item.product.stock })}
                          {item.issue === "NOT_ENOUGH_STOCK" ? (
                            <button
                              onClick={() => change(() => updateItem(item.productId, item.product.stock))}
                              className="ml-2 font-semibold text-foreground underline underline-offset-4"
                            >
                              {t("cart.keepOnly", { n: item.product.stock })}
                            </button>
                          ) : null}
                        </span>
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                      {/* Cantidad en cápsula: menos, número, más (no aplica a lo que ya no se vende) */}
                      {gone ? (
                        <span />
                      ) : (
                        <div className="flex items-center rounded-full border border-border bg-background">
                          <button
                            onClick={() => change(() => updateItem(item.productId, item.quantity - 1))}
                            disabled={item.quantity <= 1}
                            aria-label={t("cart.decrease")}
                            className={stepButton}
                          >
                            <Minus size={15} />
                          </button>
                          <span key={item.quantity} className="animate-emerger w-7 text-center text-sm font-semibold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => change(() => updateItem(item.productId, item.quantity + 1))}
                            disabled={atMax}
                            aria-label={atMax ? t("cart.maxReached") : t("cart.increase")}
                            className={stepButton}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      )}
                      <p className={cn("text-base font-bold tracking-tight tabular-nums", gone && "text-muted-foreground")}>
                        {formatCOP(unitPrice * item.quantity)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Resumen: fijo a un lado en escritorio */}
          <aside className="rounded-[2rem] border border-border bg-surface p-6 shadow-elevada lg:sticky lg:top-24">
            <h2 className="text-lg font-bold tracking-tight">{t("cart.summary")}</h2>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("cart.shipping")}</dt>
                <dd className="text-right text-muted-foreground">{t("cart.shippingCalculated")}</dd>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-border pt-4">
                <dt className="font-semibold">{t("cart.subtotal")}</dt>
                <dd className="text-2xl font-bold tracking-tight tabular-nums">{formatCOP(subtotal)}</dd>
              </div>
            </dl>
            {blocked ? (
              <p className="mt-5 flex items-start gap-1.5 text-sm font-medium text-aviso">
                <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
                {t("cart.fixToContinue")}
              </p>
            ) : null}
            <Button size="lg" block disabled={blocked} onClick={() => router.push("/checkout")} {...magnetic} className="mt-6 hidden md:inline-flex">
              {t("cart.continueToPayment")}
            </Button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck size={14} aria-hidden className="text-exito" />
              {t("home.trustPayment")}
            </p>
          </aside>

          {/* Celular: barra fija para pagar, sobre las pestañas */}
          <div
            data-barra-compra
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex h-[4.5rem] items-center gap-3 border-t border-border bg-surface px-4 shadow-[0_-12px_30px_-18px_rgb(0_0_0/0.3)] md:hidden print:hidden"
          >
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("cart.subtotal")}</p>
              <p className="text-lg leading-tight font-bold tracking-tight tabular-nums">{formatCOP(subtotal)}</p>
            </div>
            <Button disabled={blocked} onClick={() => router.push("/checkout")} className="ml-auto h-12 flex-1">
              {t("cart.continueToPayment")}
            </Button>
          </div>
        </div>
      )}
    </Container>
  );
}
