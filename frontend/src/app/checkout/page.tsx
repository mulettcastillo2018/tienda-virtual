"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Check, CreditCard, MapPin, Plus, ShieldCheck, ShoppingBag, UserRound } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthHydrated, useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { AddressForm, type AddressFormValues } from "@/components/AddressForm";
import { getEffectivePrice } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { magnetic } from "@/lib/magnetic";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Field, Input } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Order, OrderQuote, PaymentOption, ShippingAddress } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

type Step = "address" | "summary";
// La dirección del pedido: una guardada (con cuenta) o la que escribe el invitado.
type CheckoutAddress = Pick<ShippingAddress, "fullName" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "phone"> & { id?: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Paso a paso: los pasos hechos quedan en verde con un check; el actual, en tinta.
function Stepper({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="flex items-center gap-2">
      {labels.map((label, index) => {
        const n = index + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300",
                done ? "bg-exito text-white dark:text-background" : active ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground",
              )}
            >
              {done ? <Check size={15} strokeWidth={3} /> : n}
            </span>
            <span className={cn("text-sm font-semibold", active ? "text-foreground" : "hidden text-muted-foreground sm:inline")}>{label}</span>
            {n < labels.length ? <span aria-hidden className={cn("h-px min-w-4 flex-1", done ? "bg-exito" : "bg-border")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

// Una forma de pago como tarjeta seleccionable.
function PaymentChoice({
  checked,
  disabled,
  onSelect,
  Icon,
  title,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  Icon: typeof CreditCard;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-sm transition-[border-color,box-shadow,background-color] duration-200",
        disabled ? "cursor-not-allowed border-border opacity-60" : "cursor-pointer",
        checked ? "border-foreground bg-surface-2/60 shadow-suave ring-1 ring-foreground" : !disabled && "border-border hover:border-border-strong",
      )}
    >
      <input type="radio" name="paymentOption" checked={checked} disabled={disabled} onChange={onSelect} className="mt-0.5 size-4 shrink-0" />
      <Icon size={20} aria-hidden className="mt-px shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export default function CheckoutPage() {
  const [step, setStep] = useState<Step>("address");
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [address, setAddress] = useState<CheckoutAddress | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("ONLINE");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = useAuthStore((state) => state.token);
  const authHydrated = useAuthHydrated();
  const cart = useCartStore((state) => state.cart);
  const guestItems = useCartStore((state) => state.guestItems);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const clearGuestCart = useCartStore((state) => state.clearGuestCart);
  const router = useRouter();
  const t = useT();
  const guest = authHydrated && !token;

  useEffect(() => {
    if (!token) {
      setLoadingAddresses(false);
      return;
    }
    setLoadingAddresses(true);
    apiFetch<ShippingAddress[]>("/addresses", { token })
      .then((data) => {
        setAddresses(data);
        setShowNewAddressForm(data.length === 0);
      })
      .catch(() => setError(t("checkout.loadAddressesError")))
      .finally(() => setLoadingAddresses(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Al llegar a confirmar: cuánto cuesta el envío a esa dirección y si se puede pagar contra entrega.
  useEffect(() => {
    if (step !== "summary" || !address) return;
    let stale = false;
    setQuote(null);
    const body = address.id && token ? { shippingAddressId: address.id } : { address: { city: address.city, postalCode: address.postalCode }, items: guestItems };
    apiFetch<OrderQuote>("/orders/quote", { method: "POST", token, body: JSON.stringify(body) })
      .then((result) => {
        if (stale) return;
        setQuote(result);
        if (!result.cod.available) setPaymentOption("ONLINE");
      })
      .catch((err) => {
        if (!stale) setError(err instanceof ApiError ? err.message : t("checkout.quoteError"));
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, address, token]);

  if (!authHydrated) return null;

  const items = cart?.items ?? [];
  if (cart && items.length === 0) {
    return (
      <Container width="narrow" className="py-16 sm:py-24">
        <div className="flex flex-col items-center rounded-[2rem] border border-dashed border-border px-6 py-12 text-center">
          <ShoppingBag size={28} aria-hidden className="text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">{t("cart.empty")}</p>
          <Link href="/" className={cn(buttonStyles({ variant: "dark" }), "mt-6")}>
            {t("paymentResult.keepShopping")}
          </Link>
        </div>
      </Container>
    );
  }

  function goToSummary(next: CheckoutAddress) {
    setError(null);
    setAddress(next);
    setStep("summary");
  }

  function handleUseSelectedAddress() {
    const selected = addresses.find((a) => a.id === selectedAddressId);
    if (selected) goToSummary(selected);
  }

  async function handleNewAddressSubmit(values: AddressFormValues) {
    if (guest) {
      if (!EMAIL_PATTERN.test(email.trim())) {
        setEmailError(t("checkout.emailInvalid"));
        emailRef.current?.focus();
        return;
      }
      setEmailError(null);
      goToSummary(values);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const created = await apiFetch<ShippingAddress>("/addresses", { method: "POST", token, body: JSON.stringify(values) });
      goToSummary(created);
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
      if (guest) {
        const created = await apiFetch<Order & { accessToken: string }>("/orders/guest-checkout", {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), address, items: guestItems, paymentOption }),
        });
        clearGuestCart();
        router.push(`/checkout/result?orderId=${created.id}&t=${encodeURIComponent(created.accessToken)}`);
      } else {
        const created = await apiFetch<Order>("/orders/checkout", {
          method: "POST",
          token,
          body: JSON.stringify({ shippingAddressId: address.id, paymentOption }),
        });
        // El pedido queda reservado y el carrito vacío: el pago (y sus
        // reintentos) se hace en la página de resultado.
        fetchCart().catch(() => {});
        router.push(`/checkout/result?orderId=${created.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checkout.createOrderError"));
      setLoading(false);
    }
  }

  const subtotal = items.reduce((sum, item) => sum + getEffectivePrice(item.product) * item.quantity, 0);
  const cod = paymentOption === "CASH_ON_DELIVERY";
  const codFee = cod && quote ? quote.cod.fee : 0;
  const total = quote ? quote.total + codFee : null;
  const codHint = !quote
    ? ""
    : quote.cod.reason === "CITY"
      ? t("checkout.codUnavailableCity", { city: address?.city ?? "" })
      : quote.cod.reason === "AMOUNT"
        ? t("checkout.codUnavailableAmount", { amount: formatCOP(quote.cod.maxAmount) })
        : quote.cod.fee > 0
          ? t("checkout.payCodHintFee", { fee: formatCOP(quote.cod.fee) })
          : t("checkout.payCodHint");

  return (
    <Container className="max-w-5xl pt-6 pb-16 sm:pt-10">
      <div className="mb-8 px-1">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("checkout.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("checkout.step", { n: step === "address" ? "1" : "2" })}</p>
        <div className="mt-5">
          <Stepper current={step === "address" ? 1 : 2} labels={[t("checkout.stepAddress"), t("checkout.stepReview"), t("checkout.stepPayment")]} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="min-w-0 rounded-[2rem] border border-border bg-surface p-5 shadow-suave sm:p-8">
          {error ? (
            <p role="alert" className="mb-5 rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
              {error}
            </p>
          ) : null}

          {step === "address" && guest ? (
            <div className="grid gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <UserRound size={18} aria-hidden className="shrink-0" />
                  {t("checkout.haveAccount")}
                </p>
                <Link href="/login?next=/checkout" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  {t("checkout.loginInstead")}
                </Link>
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">{t("checkout.guestTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("checkout.guestHint")}</p>
              </div>
              <Field label={t("checkout.email")} error={emailError} hint={t("checkout.emailHint")}>
                {(control) => (
                  <Input
                    {...control}
                    ref={emailRef}
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={200}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}
              </Field>
              <AddressForm
                initialValues={address ? { ...address, addressLine2: address.addressLine2 ?? "" } : undefined}
                submitLabel={t("checkout.continue")}
                loading={loading}
                onSubmit={handleNewAddressSubmit}
              />
            </div>
          ) : null}

          {step === "address" && !guest ? (
            <div className="grid gap-6">
              {loadingAddresses ? (
                <div className="grid gap-3">
                  <p role="status" className="sr-only">
                    {t("checkout.loadingAddresses")}
                  </p>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-20 rounded-2xl" />
                  <Skeleton className="h-20 rounded-2xl" />
                </div>
              ) : null}

              {!loadingAddresses && addresses.length > 0 ? (
                <fieldset className="grid gap-3">
                  <legend className="mb-3 text-lg font-bold tracking-tight">{t("checkout.savedAddresses")}</legend>
                  {addresses.map((a) => (
                    <label
                      key={a.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition-[border-color,box-shadow,background-color] duration-200",
                        selectedAddressId === a.id
                          ? "border-foreground bg-surface-2/60 shadow-suave ring-1 ring-foreground"
                          : "border-border hover:border-border-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="savedAddress"
                        checked={selectedAddressId === a.id}
                        onChange={() => setSelectedAddressId(a.id)}
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold">{a.fullName}</p>
                        <p className="text-muted-foreground">
                          {a.addressLine1}
                          {a.addressLine2 ? `, ${a.addressLine2}` : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {a.city}, {a.state}
                        </p>
                      </div>
                      <MapPin size={18} aria-hidden className="ml-auto shrink-0 text-muted-foreground" />
                    </label>
                  ))}

                  {!showNewAddressForm ? (
                    <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                      <Button size="lg" onClick={handleUseSelectedAddress} disabled={!selectedAddressId} className="sm:flex-1">
                        {t("checkout.continueWithAddress")}
                      </Button>
                      <Button variant="ghost" size="lg" onClick={() => setShowNewAddressForm(true)}>
                        <Plus />
                        {t("checkout.useNewAddress")}
                      </Button>
                    </div>
                  ) : null}
                </fieldset>
              ) : null}

              {showNewAddressForm ? (
                <div className={cn("animate-aparecer", addresses.length > 0 && "border-t border-border pt-6")}>
                  <h2 className="mb-4 text-lg font-bold tracking-tight">{t("checkout.newAddress")}</h2>
                  <AddressForm submitLabel={t("checkout.continue")} loading={loading} onSubmit={handleNewAddressSubmit} />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "summary" && address ? (
            <div className="animate-aparecer grid gap-5">
              <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
                <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t("checkout.shipTo")}</p>
                  <p className="mt-1 font-semibold">{address.fullName}</p>
                  <p className="text-muted-foreground">
                    {address.addressLine1}
                    {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                  </p>
                  <p className="text-muted-foreground">
                    {address.city}, {address.state}
                  </p>
                  {guest ? <p className="text-muted-foreground">{email.trim()}</p> : null}
                </div>
                <button type="button" onClick={() => setStep("address")} className="shrink-0 text-xs font-semibold underline underline-offset-4">
                  {t("checkout.change")}
                </button>
              </div>

              <fieldset className="grid gap-3">
                <legend className="mb-3 text-lg font-bold tracking-tight">{t("checkout.paymentMethod")}</legend>
                <PaymentChoice
                  checked={paymentOption === "ONLINE"}
                  onSelect={() => setPaymentOption("ONLINE")}
                  Icon={CreditCard}
                  title={t("checkout.payOnline")}
                  hint={t("checkout.payOnlineHint")}
                />
                {quote && quote.cod.reason !== "DISABLED" ? (
                  <PaymentChoice
                    checked={cod}
                    disabled={!quote.cod.available}
                    onSelect={() => setPaymentOption("CASH_ON_DELIVERY")}
                    Icon={Banknote}
                    title={t("checkout.payCod")}
                    hint={codHint}
                  />
                ) : null}
                {!quote ? <Skeleton className="h-[4.5rem] rounded-2xl" /> : null}
              </fieldset>

              {/* En escritorio el total está en el resumen lateral */}
              <div className="flex items-baseline justify-between lg:hidden">
                <span className="text-muted-foreground">{t("checkout.total")}</span>
                <span className="text-xl font-bold tabular-nums">{total !== null ? formatCOP(total) : "—"}</span>
              </div>
              <Button size="lg" block onClick={handleConfirmOrder} loading={loading} disabled={!quote} {...magnetic}>
                {loading ? t("checkout.creatingOrder") : cod ? t("checkout.confirmOrder") : t("checkout.confirmAndPay")}
              </Button>
            </div>
          ) : null}
        </div>

        {/* Resumen del pedido: fijo a un lado en escritorio */}
        <aside className="rounded-[2rem] border border-border bg-surface p-6 shadow-suave lg:sticky lg:top-24">
          <h2 className="text-lg font-bold tracking-tight">{t("cart.summary")}</h2>
          <ul className="mt-4 grid gap-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="product-media relative size-14 overflow-hidden rounded-xl">
                    {item.product.images[0] ? <Image src={item.product.images[0]} alt="" fill sizes="56px" className="object-cover" /> : null}
                  </div>
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background tabular-nums ring-2 ring-surface">
                    {item.quantity}
                  </span>
                </div>
                <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">{item.product.name}</p>
                <p className="text-sm font-semibold tabular-nums">{formatCOP(getEffectivePrice(item.product) * item.quantity)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-5 grid gap-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t("checkout.subtotal")}</dt>
              <dd className="tabular-nums">{formatCOP(quote?.subtotal ?? subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{quote ? t("checkout.shippingWith", { carrier: quote.carrier }) : t("cart.shipping")}</dt>
              <dd className={cn("text-right", quote ? "tabular-nums" : "text-muted-foreground")}>
                {quote ? formatCOP(quote.shippingCost) : step === "summary" ? t("checkout.quoting") : t("checkout.shippingAfterAddress")}
              </dd>
            </div>
            {codFee > 0 ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("checkout.codFee")}</dt>
                <dd className="tabular-nums">{formatCOP(codFee)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
              <dt className="font-semibold">{t("checkout.total")}</dt>
              <dd className="text-xl font-bold tracking-tight tabular-nums">{formatCOP(total ?? subtotal)}</dd>
            </div>
          </dl>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck size={14} aria-hidden className="text-exito" />
            {cod ? t("checkout.codTrust") : t("home.trustPayment")}
          </p>
        </aside>
      </div>
    </Container>
  );
}
