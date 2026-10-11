"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Banknote, Loader2, MapPin, SearchX, Truck } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { OrderProgress } from "@/components/OrderProgress";
import { OrderAfterSales, type ReturnBody } from "@/components/OrderAfterSales";
import { useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { ORDER_STATUS_TONE, orderStatusKey } from "@/lib/statusTones";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import type { Order } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

// Pedido hecho sin cuenta: se ve con el enlace que llegó al correo (?t=).
function GuestOrder() {
  const { id } = useParams<{ id: string }>();
  const orderToken = useSearchParams().get("t");
  const t = useT();
  const locale = useLocale();
  const [order, setOrder] = useState<Order | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const headers = { "X-Order-Token": orderToken ?? "" };

  const load = useCallback(async () => {
    if (!orderToken) {
      setMissing(true);
      return;
    }
    try {
      setOrder(await apiFetch<Order>(`/orders/guest/${id}`, { headers }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setMissing(true);
      else setError(t("guestOrder.loadError"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, orderToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestReturn(body: ReturnBody) {
    await apiFetch(`/returns/guest/${id}`, { method: "POST", headers, body: JSON.stringify(body) });
    await load();
  }

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      await apiFetch(`/orders/guest/${id}/cancel`, { method: "POST", headers });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("paymentResult.cancelError"));
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  }

  if (missing) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
          <SearchX size={28} aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">{t("guestOrder.notFoundTitle")}</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">{t("guestOrder.notFoundBody")}</p>
        <Link href="/" className={cn(buttonStyles({ variant: "dark" }), "mt-6")}>
          {t("notFound.back")}
        </Link>
      </div>
    );
  }
  if (!order) {
    return error ? (
      <p role="alert" className="rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
        {error}
      </p>
    ) : (
      <Loader2 className="mx-auto my-16 animate-spin text-muted-foreground" size={32} />
    );
  }

  const cod = order.paymentOption === "CASH_ON_DELIVERY";
  const address = order.shippingAddress;
  const date = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "long" }).format(new Date(order.createdAt));

  return (
    <div className="animate-aparecer">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t("account.orderNumber", { id: order.id.slice(-8) })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{date}</p>
        </div>
        <Badge tone={ORDER_STATUS_TONE[order.status]}>{t(orderStatusKey(order))}</Badge>
      </div>

      {cod && order.status !== "CANCELLED" ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          <Banknote size={18} aria-hidden className="mt-px shrink-0 text-muted-foreground" />
          {order.status === "DELIVERED" ? t("guestOrder.codPaid") : t("guestOrder.codPending", { amount: formatCOP(order.totalAmount) })}
        </p>
      ) : null}

      <div className="mt-6">
        <OrderProgress order={order} />
      </div>

      <ul className="mt-6 grid gap-2 border-t border-border pt-4 text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{item.quantity}×</span> {item.product?.name ?? t("account.unnamedProduct")}
            </span>
            <span className="tabular-nums">{formatCOP(item.priceAtPurchase * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid gap-1 border-t border-border pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t("checkout.shipping")}</dt>
          <dd className="tabular-nums">{formatCOP(order.shippingCost)}</dd>
        </div>
        {order.codFee > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t("checkout.codFee")}</dt>
            <dd className="tabular-nums">{formatCOP(order.codFee)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between font-bold">
          <dt>{t("checkout.total")}</dt>
          <dd className="tabular-nums">{formatCOP(order.totalAmount)}</dd>
        </div>
      </dl>

      {address?.addressLine1 ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
          {t("account.shipTo", {
            name: address.fullName,
            address: [address.addressLine1, address.addressLine2].filter(Boolean).join(", "),
            city: address.city,
          })}
        </p>
      ) : null}
      {order.trackingNumber ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Truck size={16} aria-hidden className="shrink-0" />
          {t("account.shippedBy", { carrier: order.carrier ?? "", tracking: order.trackingNumber })}
        </p>
      ) : null}

      <OrderAfterSales order={order} submit={requestReturn} />

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
          {error}
        </p>
      ) : null}

      {order.status === "PENDING" ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {!cod ? (
            <Link href={`/checkout/result?orderId=${order.id}&t=${encodeURIComponent(orderToken ?? "")}`} className={buttonStyles({ size: "md" })}>
              {t("account.payNow")}
            </Link>
          ) : (
            <span />
          )}
          {confirmCancel ? (
            <span className="animate-emerger flex items-center gap-1 text-sm">
              <span className="mr-1 text-muted-foreground">{t("paymentResult.confirmCancel")}</span>
              <Button variant="danger" size="sm" onClick={cancel} loading={cancelling}>
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
      ) : null}
    </div>
  );
}

export default function GuestOrderPage() {
  return (
    <Container width="narrow" className="py-10 sm:py-16">
      <div className="rounded-[2rem] border border-border bg-surface p-6 shadow-elevada sm:p-10">
        <Suspense>
          <GuestOrder />
        </Suspense>
      </div>
    </Container>
  );
}
