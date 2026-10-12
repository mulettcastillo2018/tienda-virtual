"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, Banknote, History, MapPin, MessageCircle } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { ORDER_STATUS_TONE, orderStatusKey } from "@/lib/statusTones";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { inputStyles } from "@/components/ui/Field";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Pagination } from "@/components/ui/Pagination";
import { SearchForm } from "@/components/ui/SearchForm";
import { paymentMethodLabel } from "@/lib/paymentMethods";
import type { AdminOrdersPage, Order, OrderStatus } from "@/lib/types";

const PAGE_SIZE = 20;
const STATUSES: OrderStatus[] = ["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];
type Tab = "ALL" | "REVIEW" | "TO_CONFIRM" | OrderStatus;

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

function formatDateTime(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

// Pasos que se marcan con un clic; el despacho pide transportadora y guía.
// Contra entrega se confirma con el cliente antes de prepararlo.
function stepFor(order: Order): { path: "confirm" | "process" | "deliver"; label: string; toast: string } | null {
  if (order.paymentOption === "CASH_ON_DELIVERY" && order.status === "PENDING") {
    return { path: "confirm", label: "adminOrders.confirmCod", toast: "adminOrders.confirmedToast" };
  }
  if (order.status === "PAID") return { path: "process", label: "adminOrders.markProcessing", toast: "adminOrders.processingToast" };
  if (order.status === "SHIPPED") return { path: "deliver", label: "adminOrders.markDelivered", toast: "adminOrders.deliveredToast" };
  return null;
}

// Enlace para escribirle al cliente por WhatsApp con el pedido ya resumido.
function whatsappConfirmUrl(order: Order, message: string) {
  const digits = (order.shippingAddress?.phone ?? "").replace(/\D/g, "");
  const phone = digits.length === 10 ? `57${digits}` : digits;
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;
}

export default function AdminOrdersPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("ALL");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [failing, setFailing] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const list = usePagedList<AdminOrdersPage>(
    "/orders",
    { page, pageSize: PAGE_SIZE, status: tab === "ALL" ? undefined : tab, q: query },
    t("adminOrders.loadError")
  );
  const reload = list.reload;

  function changeTab(next: Tab) {
    setError(null);
    setTab(next);
    setPage(1);
  }

  function handleSearch(value: string) {
    setError(null);
    setQuery(value);
    setPage(1);
  }

  function toggleHistory(orderId: string) {
    setOpenHistory((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  async function handleStep(order: Order) {
    const step = stepFor(order);
    if (!step) return;
    setError(null);
    setBusy(order.id);
    try {
      await apiFetch(`/orders/${order.id}/${step.path}`, { method: "POST", token, body: JSON.stringify({}) });
      showToast(t(step.toast));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminOrders.stepError"));
    } finally {
      setBusy(null);
    }
  }

  async function handleDispatch(orderId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const carrier = (form.elements.namedItem("carrier") as HTMLInputElement).value;
    const trackingNumber = (form.elements.namedItem("trackingNumber") as HTMLInputElement).value;

    setError(null);
    setBusy(orderId);
    try {
      await apiFetch(`/orders/${orderId}/dispatch`, {
        method: "POST",
        token,
        body: JSON.stringify({ carrier, trackingNumber }),
      });
      setDispatching(null);
      showToast(t("adminOrders.dispatchedToast"));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminOrders.dispatchError"));
    } finally {
      setBusy(null);
    }
  }

  // Contra entrega que no se concretó: se cancela y el inventario vuelve.
  async function handleCodFailed(orderId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = (event.currentTarget.elements.namedItem("note") as HTMLInputElement).value;
    setError(null);
    setBusy(orderId);
    try {
      await apiFetch(`/orders/${orderId}/cod-failed`, { method: "POST", token, body: JSON.stringify({ note }) });
      setFailing(null);
      showToast(t("adminOrders.codFailedToast"));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminOrders.stepError"));
    } finally {
      setBusy(null);
    }
  }

  async function handleResolve(orderId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = (event.currentTarget.elements.namedItem("note") as HTMLInputElement).value;
    setError(null);
    setBusy(orderId);
    try {
      await apiFetch(`/orders/${orderId}/review-resolved`, { method: "POST", token, body: JSON.stringify({ note }) });
      setResolving(null);
      showToast(t("adminOrders.reviewResolvedToast"));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminOrders.reviewResolveError"));
    } finally {
      setBusy(null);
    }
  }

  const data = list.data;
  const counts = data?.counts ?? {};
  const pendingReview = counts.REVIEW ?? 0;
  const toConfirm = counts.TO_CONFIRM ?? 0;
  const orders = data?.items ?? [];
  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "ALL", label: t("adminOrders.tabAll"), count: counts.ALL ?? 0 },
    // Contra entrega por confirmar con el cliente, solo cuando hay.
    ...(toConfirm > 0 || tab === "TO_CONFIRM" ? [{ value: "TO_CONFIRM" as const, label: t("adminOrders.tabToConfirm"), count: toConfirm }] : []),
    // "Por revisar" solo aparece cuando hay algo que revisar.
    ...(pendingReview > 0 || tab === "REVIEW" ? [{ value: "REVIEW" as const, label: t("adminOrders.tabReview"), count: pendingReview }] : []),
    ...STATUSES.map((value) => ({ value, label: t(`orderStatus.${value}`), count: counts[value] ?? 0 })),
  ];

  return (
    <div className="space-y-4">
      {pendingReview > 0 && tab !== "REVIEW" ? (
        <button
          onClick={() => changeTab("REVIEW")}
          className="flex w-full items-center gap-2 rounded-xl border border-aviso/40 bg-aviso/10 p-3 text-left text-sm text-foreground transition-colors duration-200 hover:bg-aviso/15"
        >
          <AlertTriangle size={16} className="shrink-0" aria-hidden />
          {t("adminOrders.reviewBanner", { n: pendingReview })}
        </button>
      ) : null}

      {toConfirm > 0 && tab !== "TO_CONFIRM" ? (
        <button
          onClick={() => changeTab("TO_CONFIRM")}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-2 p-3 text-left text-sm text-foreground transition-colors duration-200 hover:bg-border/60"
        >
          <Banknote size={16} className="shrink-0" aria-hidden />
          {t("adminOrders.toConfirmBanner", { n: toConfirm })}
        </button>
      ) : null}

      <FilterTabs options={tabs} value={tab} onChange={changeTab} />
      <SearchForm placeholder={t("adminOrders.searchPlaceholder")} onSearch={handleSearch} />

      {error || list.error ? <p className="text-sm font-medium text-peligro">{error ?? list.error}</p> : null}

      {data && orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("adminOrders.empty")}</p>
      ) : null}

      {orders.map((order) => {
        const lastPayment = order.payments?.[0];
        const step = stepFor(order);
        const canDispatch = order.status === "PAID" || order.status === "PROCESSING";
        const cod = order.paymentOption === "CASH_ON_DELIVERY";
        const codOpen = cod && ["PENDING", "PROCESSING", "SHIPPED"].includes(order.status);
        const email = order.user?.email ?? order.guestEmail;
        const whatsapp =
          cod && order.status === "PENDING"
            ? whatsappConfirmUrl(
                order,
                t("adminOrders.whatsappMessage", {
                  name: order.shippingAddress?.fullName ?? "",
                  order: order.id.slice(-8),
                  amount: formatCOP(order.totalAmount),
                  address: [order.shippingAddress?.addressLine1, order.shippingAddress?.city].filter(Boolean).join(", "),
                })
              )
            : null;
        const address = order.shippingAddress;
        const historyOpen = openHistory.has(order.id);
        const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return (
          <div
            key={order.id}
            className={cn("rounded-2xl border bg-surface p-4 shadow-suave sm:p-5", order.needsReview ? "border-aviso/40" : "border-border")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">#{order.id}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(order.createdAt, locale)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {cod ? (
                  <Badge tone="accent">
                    <Banknote aria-hidden />
                    {t("adminOrders.cod")}
                  </Badge>
                ) : null}
                <Badge tone={ORDER_STATUS_TONE[order.status]}>{t(orderStatusKey(order))}</Badge>
              </div>
            </div>
            {email ? (
              <p className="mt-2 text-sm [overflow-wrap:anywhere] text-muted-foreground">
                {email}
                {!order.user ? <span className="ml-1.5 text-xs font-semibold text-foreground">{t("adminOrders.guest")}</span> : null}
              </p>
            ) : null}
            {address?.addressLine1 ? (
              <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin size={14} aria-hidden className="mt-0.5 shrink-0" />
                {t("adminOrders.shipTo", {
                  name: address.fullName,
                  address: [address.addressLine1, address.addressLine2].filter(Boolean).join(", "),
                  city: address.city,
                  state: address.state,
                  phone: address.phone,
                })}
              </p>
            ) : null}
            <p className="mt-2 text-sm">
              {t("adminOrders.total", { amount: formatCOP(order.totalAmount) })}
              <span className="text-muted-foreground"> · {t("adminOrders.items", { n: itemCount })}</span>
              {order.codFee > 0 ? <span className="text-muted-foreground"> · {t("adminOrders.codFeeIncluded", { amount: formatCOP(order.codFee) })}</span> : null}
            </p>
            {order.billingName ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("adminOrders.billTo", { name: order.billingName, id: order.billingIdNumber ?? "" })}</p>
            ) : null}
            {lastPayment ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("adminOrders.lastPayment", {
                  status: t(`paymentStatus.${lastPayment.status}`),
                  method: paymentMethodLabel(lastPayment.paymentMethod, t),
                  count: order.payments?.length ?? 0,
                })}
              </p>
            ) : null}
            {order.trackingNumber ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("adminOrders.shippedBy", { carrier: order.carrier ?? "", tracking: order.trackingNumber })}
              </p>
            ) : null}

            {order.needsReview ? (
              <div className="mt-3 rounded-lg bg-aviso/10 p-3 text-sm text-foreground">
                <p className="font-semibold">{t("adminOrders.needsReview")}</p>
                <p className="mt-1 whitespace-pre-line text-xs">{order.reviewNote}</p>
                {resolving === order.id ? (
                  <form onSubmit={(e) => handleResolve(order.id, e)} className="mt-2 flex flex-wrap gap-2">
                    <input
                      name="note"
                      required
                      minLength={3}
                      maxLength={500}
                      placeholder={t("adminOrders.resolutionPlaceholder")}
                      className={cn(inputStyles, "h-9 min-w-0 flex-1 bg-background px-2.5")}
                    />
                    <Button type="submit" variant="dark" size="sm" loading={busy === order.id}>
                      {t("adminOrders.markResolved")}
                    </Button>
                  </form>
                ) : (
                  <button onClick={() => setResolving(order.id)} className="mt-2 text-xs font-semibold underline">
                    {t("adminOrders.resolve")}
                  </button>
                )}
              </div>
            ) : null}

            {dispatching === order.id && canDispatch ? (
              <form onSubmit={(e) => handleDispatch(order.id, e)} className="mt-3 flex flex-wrap gap-2">
                <input name="carrier" placeholder={t("adminOrders.carrier")} required maxLength={100} className={cn(inputStyles, "h-9 w-auto px-2.5")} />
                <input
                  name="trackingNumber"
                  placeholder={t("adminOrders.trackingNumber")}
                  required
                  maxLength={100}
                  className={cn(inputStyles, "h-9 w-auto px-2.5")}
                />
                <Button type="submit" variant="dark" size="sm" loading={busy === order.id}>
                  {t("adminOrders.confirmDispatch")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDispatching(null)}>
                  {t("common.cancel")}
                </Button>
              </form>
            ) : failing === order.id && codOpen ? (
              <form onSubmit={(e) => handleCodFailed(order.id, e)} className="mt-3 flex flex-wrap gap-2">
                <input
                  name="note"
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder={t("adminOrders.codFailedPlaceholder")}
                  className={cn(inputStyles, "h-9 min-w-0 flex-1 px-2.5")}
                />
                <Button type="submit" variant="danger" size="sm" loading={busy === order.id}>
                  {t("adminOrders.codFailedConfirm")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setFailing(null)}>
                  {t("common.cancel")}
                </Button>
              </form>
            ) : step || canDispatch || codOpen ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {whatsapp ? (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    <MessageCircle aria-hidden />
                    {t("adminOrders.whatsappConfirm")}
                  </a>
                ) : null}
                {step ? (
                  <Button variant="dark" size="sm" loading={busy === order.id} onClick={() => handleStep(order)}>
                    {t(step.label)}
                  </Button>
                ) : null}
                {canDispatch ? (
                  <Button variant="secondary" size="sm" onClick={() => setDispatching(order.id)}>
                    {t("adminOrders.markDispatched")}
                  </Button>
                ) : null}
                {codOpen ? (
                  <Button variant="ghost" size="sm" onClick={() => setFailing(order.id)} className="hover:text-peligro">
                    {t("adminOrders.codFailed")}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {order.statusLogs && order.statusLogs.length > 0 ? (
              <div className="mt-3 border-t border-border pt-3">
                <button
                  onClick={() => toggleHistory(order.id)}
                  aria-expanded={historyOpen}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <History size={14} aria-hidden />
                  {historyOpen ? t("adminOrders.hideHistory") : t("adminOrders.history")}
                </button>
                {historyOpen ? (
                  <ol className="mt-2 grid gap-2 text-xs">
                    {order.statusLogs.map((log, index) => (
                      <li key={index} className="text-muted-foreground">
                        <span className="tabular-nums">{formatDateTime(log.changedAt, locale)}</span> —{" "}
                        <span className="font-semibold text-foreground">
                          {log.fromStatus && log.fromStatus !== log.toStatus
                            ? `${t(`orderStatus.${log.fromStatus}`)} → ${t(`orderStatus.${log.toStatus}`)}`
                            : t(`orderStatus.${log.toStatus}`)}
                        </span>
                        {log.reason ? <> · {log.reason}</> : null} · {log.changedBy?.email ?? t("adminOrders.system")}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <Pagination page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
