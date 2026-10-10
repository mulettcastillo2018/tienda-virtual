"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthHydrated, useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { WompiButton } from "@/components/WompiButton";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import type { OrderStatus } from "@/lib/types";

interface PaymentStatus {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  shippingCost: number;
  expiresAt: string | null;
  needsReview: boolean;
  lastPayment: { status: string; paymentMethod: string | null } | null;
  // Hay una transacción que el banco todavía está confirmando (p. ej. PSE).
  pendingAtWompi: boolean;
}

const PAID_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
const REJECTED_PAYMENTS = ["DECLINED", "ERROR", "VOIDED"];
// Mientras el pedido siga pendiente se vuelve a consultar, por si el pago se
// aprueba (el cliente puede estar terminando de pagar en el widget).
const POLL_MS = 6000;
const MAX_POLLS = 50;

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

function ResultContent() {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const token = useAuthStore((state) => state.token);
  const authHydrated = useAuthHydrated();
  const fetchCart = useCartStore((state) => state.fetchCart);
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [data, setData] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const polls = useRef(0);

  const check = useCallback(async () => {
    if (!token || !orderId) return null;
    setChecking(true);
    try {
      const result = await apiFetch<PaymentStatus>(`/payments/wompi/sync/${orderId}`, { method: "POST", token });
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("paymentResult.loadError"));
      return null;
    } finally {
      setChecking(false);
    }
  }, [token, orderId]);

  useEffect(() => {
    // Al volver de Wompi la página carga de cero: hay que esperar a leer la sesión.
    if (!authHydrated) return;
    if (!token) {
      router.push("/login");
      return;
    }
    check();
  }, [authHydrated, token, check, router]);

  useEffect(() => {
    if (data?.status !== "PENDING") {
      // Un pedido cancelado devuelve sus productos al carrito.
      if (data?.status === "CANCELLED") fetchCart();
      return;
    }
    if (polls.current >= MAX_POLLS) return;
    const timer = setTimeout(() => {
      polls.current++;
      check();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, check, fetchCart]);

  async function cancelOrder() {
    if (!token || !orderId) return;
    setCancelling(true);
    try {
      await apiFetch(`/orders/${orderId}/cancel`, { method: "POST", token });
      await check();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("paymentResult.cancelError"));
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  if (!orderId) return <p className="py-20 text-center text-muted-foreground">{t("paymentResult.noOrder")}</p>;
  if (!data) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        {error ? (
          <p role="alert" className="rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
            {error}
          </p>
        ) : (
          <Loader2 className="mx-auto animate-spin" size={32} />
        )}
      </div>
    );
  }

  const shortId = data.id.slice(-8);
  const deadline = data.expiresAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { hour: "numeric", minute: "2-digit" }).format(new Date(data.expiresAt))
    : null;
  const rejected = data.lastPayment && REJECTED_PAYMENTS.includes(data.lastPayment.status);

  if (PAID_STATUSES.includes(data.status)) {
    return (
      <div className="animate-aparecer text-center">
        <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-exito/12 text-exito">
          <CheckCircle2 size={40} aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">{t("paymentResult.paidTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("paymentResult.paidBody", { order: shortId })}</p>
        {data.needsReview ? (
          <p className="mt-4 rounded-2xl bg-aviso/10 px-4 py-3 text-sm font-medium text-aviso">{t("paymentResult.underReview")}</p>
        ) : null}
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/account" className={buttonStyles({ variant: "dark", size: "lg" })}>
            {t("paymentResult.myOrders")}
          </Link>
          <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg" })}>
            {t("paymentResult.keepShopping")}
          </Link>
        </div>
      </div>
    );
  }

  if (data.status === "CANCELLED") {
    return (
      <div className="animate-aparecer text-center">
        <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
          <XCircle size={40} aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">{t("paymentResult.cancelledTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{data.needsReview ? t("paymentResult.cancelledWithPayment") : t("paymentResult.cancelledBody")}</p>
        <Link href="/cart" className={cn(buttonStyles({ variant: "dark", size: "lg" }), "mt-8")}>
          {t("paymentResult.goToCart")}
        </Link>
      </div>
    );
  }

  // Pendiente de pago.
  return (
    <div className="animate-aparecer">
      <div className="text-center">
        <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Clock size={36} aria-hidden />
        </span>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">
          {data.pendingAtWompi ? t("paymentResult.waitingTitle") : rejected ? t("paymentResult.rejectedTitle") : t("paymentResult.payTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {data.pendingAtWompi
            ? t("paymentResult.waitingBody")
            : rejected
              ? t("paymentResult.rejectedBody")
              : t("paymentResult.payBody", { order: shortId })}
        </p>
        {deadline ? (
          <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-medium">{t("paymentResult.deadline", { time: deadline })}</p>
        ) : null}
      </div>

      <dl className="mt-6 grid gap-2 rounded-2xl border border-border bg-background p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t("checkout.shipping")}</dt>
          <dd className="tabular-nums">{formatCOP(data.shippingCost)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <dt className="font-semibold">{t("checkout.total")}</dt>
          <dd className="text-2xl font-bold tracking-tight tabular-nums">{formatCOP(data.totalAmount)}</dd>
        </div>
      </dl>

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
          {error}
        </p>
      ) : null}

      {!data.pendingAtWompi ? (
        // El widget de Wompi dibuja su propio botón; aquí solo se centra.
        <div className="mt-6 flex justify-center">
          {/* Un intento nuevo cada vez que el anterior se rechaza. */}
          <WompiButton key={`${data.lastPayment?.status ?? "none"}`} orderId={data.id} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
        <Button variant="ghost" size="sm" onClick={() => check()} disabled={checking}>
          <RefreshCw className={cn(checking && "animate-spin")} />
          {checking ? t("paymentResult.checking") : t("paymentResult.alreadyPaid")}
        </Button>
        {confirmCancel ? (
          <span className="animate-emerger flex items-center gap-1">
            <span className="mr-1 text-muted-foreground">{t("paymentResult.confirmCancel")}</span>
            <Button variant="danger" size="sm" onClick={cancelOrder} loading={cancelling}>
              {t("paymentResult.yes")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
              {t("paymentResult.no")}
            </Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(true)} className="hover:text-peligro">
            {t("paymentResult.cancelOrder")}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <Container width="narrow" className="py-10 sm:py-16">
      <div className="rounded-[2rem] border border-border bg-surface p-6 shadow-elevada sm:p-10">
        <Suspense>
          <ResultContent />
        </Suspense>
      </div>
    </Container>
  );
}
