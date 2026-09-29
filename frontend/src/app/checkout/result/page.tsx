"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { WompiButton } from "@/components/WompiButton";
import { useLocale, useT } from "@/lib/i18n";
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
    if (!token) {
      router.push("/login");
      return;
    }
    check();
  }, [token, check, router]);

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
        {error ? <p className="text-red-600">{error}</p> : <Loader2 className="mx-auto animate-spin" size={32} />}
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
      <div className="text-center">
        <CheckCircle2 className="mx-auto text-accent" size={56} />
        <h1 className="mt-4 text-2xl font-bold">{t("paymentResult.paidTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("paymentResult.paidBody", { order: shortId })}</p>
        {data.needsReview ? <p className="mt-3 text-sm text-amber-600">{t("paymentResult.underReview")}</p> : null}
        <div className="mt-6 flex justify-center gap-4 text-sm font-semibold">
          <Link href="/account" className="text-accent">
            {t("paymentResult.myOrders")}
          </Link>
          <Link href="/" className="text-accent">
            {t("paymentResult.keepShopping")}
          </Link>
        </div>
      </div>
    );
  }

  if (data.status === "CANCELLED") {
    return (
      <div className="text-center">
        <XCircle className="mx-auto text-muted-foreground" size={56} />
        <h1 className="mt-4 text-2xl font-bold">{t("paymentResult.cancelledTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{data.needsReview ? t("paymentResult.cancelledWithPayment") : t("paymentResult.cancelledBody")}</p>
        <Link href="/cart" className="mt-6 inline-block font-semibold text-accent">
          {t("paymentResult.goToCart")}
        </Link>
      </div>
    );
  }

  // Pendiente de pago.
  return (
    <div>
      <div className="text-center">
        <Clock className="mx-auto text-accent" size={48} />
        <h1 className="mt-4 text-2xl font-bold">
          {data.pendingAtWompi ? t("paymentResult.waitingTitle") : rejected ? t("paymentResult.rejectedTitle") : t("paymentResult.payTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {data.pendingAtWompi
            ? t("paymentResult.waitingBody")
            : rejected
              ? t("paymentResult.rejectedBody")
              : t("paymentResult.payBody", { order: shortId })}
        </p>
        {deadline ? <p className="mt-2 text-sm font-semibold">{t("paymentResult.deadline", { time: deadline })}</p> : null}
      </div>

      <div className="mt-6 space-y-2 rounded-xl border border-border p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("checkout.shipping")}</span>
          <span>{formatCOP(data.shippingCost)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <span>{t("checkout.total")}</span>
          <span>{formatCOP(data.totalAmount)}</span>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {!data.pendingAtWompi ? (
        <div className="mt-6">
          {/* Un intento nuevo cada vez que el anterior se rechaza. */}
          <WompiButton key={`${data.lastPayment?.status ?? "none"}`} orderId={data.id} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button onClick={() => check()} disabled={checking} className="font-semibold text-accent disabled:opacity-50">
          {checking ? t("paymentResult.checking") : t("paymentResult.alreadyPaid")}
        </button>
        {confirmCancel ? (
          <span className="flex items-center gap-2">
            {t("paymentResult.confirmCancel")}
            <button onClick={cancelOrder} disabled={cancelling} className="font-semibold text-red-600 disabled:opacity-50">
              {t("paymentResult.yes")}
            </button>
            <button onClick={() => setConfirmCancel(false)} className="font-semibold text-muted-foreground">
              {t("paymentResult.no")}
            </button>
          </span>
        ) : (
          <button onClick={() => setConfirmCancel(true)} className="font-semibold text-muted-foreground hover:text-red-600">
            {t("paymentResult.cancelOrder")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Suspense>
        <ResultContent />
      </Suspense>
    </div>
  );
}
