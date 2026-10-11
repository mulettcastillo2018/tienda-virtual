"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, MapPin, MessageSquareText, Package, Pencil, Truck, UserRound, type LucideIcon } from "lucide-react";
import { apiFetch, ApiError, uploadFile } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { AddressForm, type AddressFormValues } from "@/components/AddressForm";
import { PqrsTimeline } from "@/components/PqrsTimeline";
import { OrderProgress } from "@/components/OrderProgress";
import { useT, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { ORDER_STATUS_TONE, PQRS_STATUS_TONE } from "@/lib/statusTones";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Field, Input, inputStyles, Select, Textarea } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Order, Pqrs, PqrsType, ShippingAddress, UserProfile } from "@/lib/types";

// Tarjeta de cada sección de la cuenta, con ancla para la navegación lateral.
function AccountSection({
  id,
  icon: Icon,
  title,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 rounded-[2rem] border border-border bg-surface p-5 shadow-suave sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-foreground/80">
            <Icon size={17} aria-hidden />
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="mb-4 rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
      {children}
    </p>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

function formatDate(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "long" }).format(new Date(iso));
}

export default function AccountPage() {
  const token = useAuthStore((state) => state.token);
  const authUser = useAuthStore((state) => state.user);
  const setToken = useAuthStore((state) => state.setToken);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.show);

  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [pqrsList, setPqrsList] = useState<Pqrs[]>([]);
  const [expandedPqrs, setExpandedPqrs] = useState<Set<string>>(new Set());
  const [showPqrsForm, setShowPqrsForm] = useState(false);
  const [pqrsError, setPqrsError] = useState<string | null>(null);
  const [submittingPqrs, setSubmittingPqrs] = useState(false);
  const [pqrsAttachment, setPqrsAttachment] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    Promise.all([
      apiFetch<UserProfile>("/auth/me", { token }),
      apiFetch<ShippingAddress[]>("/addresses", { token }),
      apiFetch<Order[]>("/orders/me", { token }),
      apiFetch<Pqrs[]>("/pqrs/me", { token }),
    ])
      .then(([profileData, addressesData, ordersData, pqrsData]) => {
        setProfile(profileData);
        setAddresses(addressesData);
        setOrders(ordersData);
        setPqrsList(pqrsData);
      })
      .catch(() => setError(t("account.loadError")))
      .finally(() => setLoading(false));
  }, [token]);

  function togglePqrs(id: string) {
    setExpandedPqrs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreatePqrs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const type = field("type") as PqrsType;
    const subject = field("subject");
    const message = field("message");
    const orderId = field("orderId");

    setPqrsError(null);
    setSubmittingPqrs(true);
    try {
      // El adjunto se sube primero y la solicitud lleva su clave (privada).
      let attachmentKey: string | undefined;
      if (pqrsAttachment) {
        setUploadingAttachment(true);
        const { key } = await uploadFile<{ key: string }>("/uploads/pqrs-attachment", pqrsAttachment, token);
        attachmentKey = key;
        setUploadingAttachment(false);
      }

      const created = await apiFetch<Pqrs>("/pqrs", {
        method: "POST",
        token,
        body: JSON.stringify({ type, subject, message, ...(orderId ? { orderId } : {}), ...(attachmentKey ? { attachmentKey } : {}) }),
      });
      setPqrsList((prev) => [created, ...prev]);
      setShowPqrsForm(false);
      setPqrsAttachment(null);
      showToast(t("account.requestSentToast"));
    } catch (err) {
      setPqrsError(err instanceof ApiError ? err.message : t("account.sendRequestError"));
    } finally {
      setSubmittingPqrs(false);
      setUploadingAttachment(false);
    }
  }

  function toggleOrder(orderId: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  async function handleSaveAddress(addressId: string, values: AddressFormValues) {
    if (!token) return;
    setAddressError(null);
    setSavingAddress(true);
    try {
      const updated = await apiFetch<ShippingAddress>(`/addresses/${addressId}`, {
        method: "PUT",
        token,
        body: JSON.stringify(values),
      });
      setAddresses((prev) => prev.map((a) => (a.id === addressId ? updated : a)));
      setEditingAddressId(null);
    } catch (err) {
      setAddressError(err instanceof ApiError ? err.message : t("account.saveAddressError"));
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleSavePhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const phone = (event.currentTarget.elements.namedItem("phone") as HTMLInputElement).value;

    setPhoneError(null);
    setSavingPhone(true);
    try {
      const updated = await apiFetch<UserProfile>("/auth/profile", {
        method: "PUT",
        token,
        body: JSON.stringify({ phone }),
      });
      setProfile(updated);
      showToast(t("account.phoneSavedToast"));
    } catch (err) {
      setPhoneError(err instanceof ApiError ? err.message : t("account.savePhoneError"));
    } finally {
      setSavingPhone(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const currentPassword = field("currentPassword");
    const newPassword = field("newPassword");
    const confirmPassword = field("confirmPassword");

    if (newPassword !== confirmPassword) {
      setPasswordError(t("account.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t("account.passwordTooShort"));
      return;
    }

    setPasswordError(null);
    setChangingPassword(true);
    try {
      // Cambiar la contraseña cierra las demás sesiones; esta sigue con el
      // token nuevo que devuelve el servidor.
      const result = await apiFetch<{ token: string }>("/auth/password", {
        method: "PUT",
        token,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setToken(result.token);
      form.reset();
      showToast(t("account.passwordUpdatedToast"));
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : t("account.changePasswordError"));
    } finally {
      setChangingPassword(false);
    }
  }

  if (!token || !authUser) {
    return (
      <Container width="narrow" className="py-16 sm:py-24">
        <div className="flex flex-col items-center rounded-[2rem] border border-border bg-surface px-6 py-12 text-center shadow-suave">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-foreground/80">
            <UserRound size={28} aria-hidden />
          </span>
          <p className="mt-5 max-w-xs text-muted-foreground">{t("account.loginRequired")}</p>
          <Link href="/login" className={cn(buttonStyles({ variant: "dark" }), "mt-6")}>
            {t("account.login")}
          </Link>
        </div>
      </Container>
    );
  }

  const sections = [
    { id: "compras", label: t("account.myOrders"), Icon: Package },
    { id: "pqrs", label: t("account.pqrsTitle"), Icon: MessageSquareText },
    { id: "direcciones", label: t("account.myAddresses"), Icon: MapPin },
    { id: "datos", label: t("account.accountData"), Icon: UserRound },
    { id: "seguridad", label: t("account.security"), Icon: KeyRound },
  ];
  const email = profile?.email ?? authUser.email;

  return (
    <Container className="max-w-6xl pt-6 pb-16 sm:pt-10">
      {/* Encabezado: inicial, nombre de la cuenta y antigüedad */}
      <div className="mb-8 flex items-center gap-4 px-1">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground text-xl font-bold text-background uppercase shadow-elevada sm:size-16">
          {email.charAt(0)}
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("account.title")}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {email}
            {profile ? <> · {t("account.customerSince", { date: formatDate(profile.createdAt, locale) })}</> : null}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4">
          <p role="status" className="sr-only">
            {t("account.loading")}
          </p>
          <Skeleton className="h-40 rounded-[2rem]" />
          <Skeleton className="h-56 rounded-[2rem]" />
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      {!loading && !error ? (
        <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          {/* Secciones: fila deslizable en celular, columna fija en escritorio */}
          <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
            {sections.map(({ id, label, Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="flex shrink-0 items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:text-foreground lg:rounded-xl lg:border-transparent lg:bg-transparent lg:px-3 lg:whitespace-normal lg:hover:bg-surface-2"
              >
                <Icon size={16} aria-hidden className="shrink-0" />
                {label}
              </a>
            ))}
          </nav>

          <div className="grid min-w-0 gap-6">
            <AccountSection id="compras" icon={Package} title={t("account.myOrders")}>
              {orders.length === 0 ? (
                <EmptyNote>{t("account.noOrders")}</EmptyNote>
              ) : (
                <ul className="grid gap-2.5">
                  {orders.map((order) => {
                    const expanded = expandedOrders.has(order.id);
                    return (
                      <li key={order.id} className="overflow-hidden rounded-2xl border border-border bg-background">
                        <button
                          onClick={() => toggleOrder(order.id)}
                          aria-expanded={expanded}
                          className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 text-left transition-colors duration-200 hover:bg-surface-2/60"
                        >
                          <div>
                            <p className="font-semibold">{t("account.orderNumber", { id: order.id.slice(-8) })}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(order.createdAt, locale)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold tabular-nums">{formatCOP(order.totalAmount)}</span>
                            <Badge tone={ORDER_STATUS_TONE[order.status]}>{t(`orderStatus.${order.status}`)}</Badge>
                            <ChevronDown
                              size={18}
                              aria-hidden
                              className={cn("text-muted-foreground transition-[rotate] duration-300 ease-salida", expanded && "rotate-180")}
                            />
                          </div>
                        </button>

                        {expanded ? (
                          <div className="animate-aparecer border-t border-border p-4">
                            <ul className="grid gap-2 text-sm">
                              {order.items.map((item) => (
                                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4">
                                  <span className="text-muted-foreground">
                                    <span className="font-semibold text-foreground tabular-nums">{item.quantity}×</span>{" "}
                                    {item.product?.name ?? t("account.unnamedProduct")}
                                    {item.discountLog ? (
                                      <span className="ml-1 text-xs text-accent">
                                        {t("account.includedDiscount", { percent: item.discountLog.discountPercentage })}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="tabular-nums">{formatCOP(item.priceAtPurchase)}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3 grid gap-1 border-t border-border pt-3 text-sm">
                              <p className="text-muted-foreground">{t("account.shippingCost", { amount: formatCOP(order.shippingCost) })}</p>
                              <p className="font-bold">{t("account.total", { amount: formatCOP(order.totalAmount) })}</p>
                            </div>
                            {order.status !== "PENDING" ? (
                              <div className="mt-4">
                                <OrderProgress order={order} />
                              </div>
                            ) : null}
                            {order.shippingAddress?.addressLine1 ? (
                              <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                                <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" />
                                {t("account.shipTo", {
                                  name: order.shippingAddress.fullName,
                                  address: [order.shippingAddress.addressLine1, order.shippingAddress.addressLine2].filter(Boolean).join(", "),
                                  city: order.shippingAddress.city,
                                })}
                              </p>
                            ) : null}
                            {order.status === "PENDING" ? (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-aviso/10 p-3 text-sm">
                                {order.expiresAt ? (
                                  <span className="font-medium text-aviso">
                                    {t("account.payBefore", {
                                      time: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.expiresAt)),
                                    })}
                                  </span>
                                ) : null}
                                <Link href={`/checkout/result?orderId=${order.id}`} className={buttonStyles({ size: "sm" })}>
                                  {t("account.payNow")}
                                </Link>
                              </div>
                            ) : null}
                            {order.trackingNumber ? (
                              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                <Truck size={16} aria-hidden className="shrink-0" />
                                {t("account.shippedBy", { carrier: order.carrier ?? "", tracking: order.trackingNumber })}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </AccountSection>

            <AccountSection
              id="pqrs"
              icon={MessageSquareText}
              title={t("account.pqrsTitle")}
              action={
                !showPqrsForm ? (
                  <Button variant="secondary" size="sm" onClick={() => setShowPqrsForm(true)}>
                    {t("account.newRequest")}
                  </Button>
                ) : null
              }
            >
              {showPqrsForm ? (
                <form onSubmit={handleCreatePqrs} className="animate-aparecer mb-5 grid gap-4 rounded-2xl border border-border bg-background p-4 sm:p-5">
                  {pqrsError ? <Alert>{pqrsError}</Alert> : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("account.requestType")}>
                      {(control) => (
                        <Select {...control} name="type" required>
                          {(["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"] as PqrsType[]).map((value) => (
                            <option key={value} value={value}>
                              {t(`pqrsType.${value}`)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label={t("account.subject")}>{(control) => <Input {...control} name="subject" required />}</Field>
                  </div>
                  <Field label={t("account.messagePlaceholder")}>
                    {(control) => <Textarea {...control} name="message" required rows={3} />}
                  </Field>
                  {orders.length > 0 ? (
                    <Field label={t("account.relateToOrderOptional")}>
                      {(control) => (
                        <Select {...control} name="orderId">
                          <option value="">—</option>
                          {orders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {t("account.orderNumber", { id: order.id.slice(-8) })} — {formatDate(order.createdAt, locale)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  ) : null}
                  <Field label={t("account.attachmentLabel")}>
                    {(control) => (
                      <input
                        {...control}
                        type="file"
                        accept="image/*,video/mp4,video/webm,video/quicktime"
                        onChange={(e) => setPqrsAttachment(e.target.files?.[0] ?? null)}
                        className={cn(
                          inputStyles,
                          "h-12 py-2 text-muted-foreground file:mr-3 file:h-full file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:text-sm file:font-semibold file:text-foreground",
                        )}
                      />
                    )}
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="dark" loading={submittingPqrs}>
                      {uploadingAttachment ? t("account.uploadingAttachment") : submittingPqrs ? t("account.sending") : t("account.sendRequest")}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowPqrsForm(false)}>
                      {t("account.cancel")}
                    </Button>
                  </div>
                </form>
              ) : null}

              {pqrsList.length === 0 ? (
                <EmptyNote>{t("account.noPqrs")}</EmptyNote>
              ) : (
                <ul className="grid gap-2.5">
                  {pqrsList.map((pqrs) => {
                    const expanded = expandedPqrs.has(pqrs.id);
                    return (
                      <li key={pqrs.id} className="overflow-hidden rounded-2xl border border-border bg-background">
                        <button
                          onClick={() => togglePqrs(pqrs.id)}
                          aria-expanded={expanded}
                          className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 text-left transition-colors duration-200 hover:bg-surface-2/60"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold">
                              {t(`pqrsType.${pqrs.type}`)}: {pqrs.subject}
                            </p>
                            <p className="text-sm text-muted-foreground">{formatDate(pqrs.createdAt, locale)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge tone={PQRS_STATUS_TONE[pqrs.status]}>{t(`pqrsStatus.${pqrs.status}`)}</Badge>
                            <ChevronDown
                              size={18}
                              aria-hidden
                              className={cn("text-muted-foreground transition-[rotate] duration-300 ease-salida", expanded && "rotate-180")}
                            />
                          </div>
                        </button>

                        {expanded ? (
                          <div className="animate-aparecer border-t border-border p-4 text-sm">
                            <p className="leading-relaxed text-muted-foreground">{pqrs.message}</p>
                            {pqrs.attachmentUrl ? (
                              <a
                                href={pqrs.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-block text-xs font-semibold underline underline-offset-4"
                              >
                                {t("account.viewAttachment")}
                              </a>
                            ) : null}

                            <div className="mt-5">
                              <PqrsTimeline pqrs={pqrs} />
                            </div>

                            {pqrs.response ? (
                              <div className="mt-4 rounded-2xl bg-surface-2 p-4">
                                <p className="font-semibold">{t("account.response")}</p>
                                <p className="mt-1 leading-relaxed text-muted-foreground">{pqrs.response}</p>
                                {pqrs.responseAttachmentUrl ? (
                                  <a
                                    href={pqrs.responseAttachmentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-block text-xs font-semibold underline underline-offset-4"
                                  >
                                    {t("account.viewResponseAttachment")}
                                  </a>
                                ) : null}
                              </div>
                            ) : (
                              <p className="mt-4 text-muted-foreground">{t("account.noResponseYet")}</p>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </AccountSection>

            <AccountSection id="direcciones" icon={MapPin} title={t("account.myAddresses")}>
              {addressError ? <Alert>{addressError}</Alert> : null}
              {addresses.length === 0 ? (
                <EmptyNote>{t("account.noAddresses")}</EmptyNote>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((address) =>
                    editingAddressId === address.id ? (
                      <div key={address.id} className="animate-aparecer rounded-2xl border border-border bg-background p-4 sm:col-span-2 sm:p-5">
                        <AddressForm
                          submitLabel={t("account.saveChanges")}
                          loading={savingAddress}
                          initialValues={{
                            fullName: address.fullName,
                            addressLine1: address.addressLine1,
                            addressLine2: address.addressLine2 ?? "",
                            city: address.city,
                            state: address.state,
                            postalCode: address.postalCode,
                            phone: address.phone,
                          }}
                          onSubmit={(values) => handleSaveAddress(address.id, values)}
                          onCancel={() => setEditingAddressId(null)}
                        />
                      </div>
                    ) : (
                      <div key={address.id} className="flex flex-col rounded-2xl border border-border bg-background p-4 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold">{address.fullName}</p>
                            <p className="text-muted-foreground">
                              {address.addressLine1}
                              {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                            </p>
                            <p className="text-muted-foreground">
                              {address.city}, {address.state}
                            </p>
                            <p className="text-muted-foreground">{address.phone}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setEditingAddressId(address.id)} className="-mt-1 -mr-1 shrink-0">
                            <Pencil />
                            {t("account.edit")}
                          </Button>
                        </div>
                        {address.updatedAt !== address.createdAt ? (
                          <p className="mt-3 text-xs text-muted-foreground">
                            {t("account.lastModified", { date: formatDate(address.updatedAt, locale) })}
                          </p>
                        ) : null}
                      </div>
                    ),
                  )}
                </div>
              )}
            </AccountSection>

            <AccountSection id="datos" icon={UserRound} title={t("account.accountData")}>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-surface-2 p-4">
                  <dt className="text-xs text-muted-foreground">{t("login.email")}</dt>
                  <dd className="mt-1 truncate font-medium">{profile?.email}</dd>
                </div>
                {profile?.phone ? (
                  <div className="rounded-2xl bg-surface-2 p-4">
                    <dt className="text-xs text-muted-foreground">{t("login.phone")}</dt>
                    <dd className="mt-1 font-medium">{profile.phone}</dd>
                  </div>
                ) : null}
              </dl>
              {!profile?.phone ? (
                <div className="mt-4 rounded-2xl bg-aviso/10 p-4">
                  <p className="text-sm font-semibold text-aviso">{t("account.missingPhone")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("account.missingPhoneHint")}</p>
                  {phoneError ? <p className="mt-2 text-sm font-medium text-peligro">{phoneError}</p> : null}
                  <form onSubmit={handleSavePhone} className="mt-3 flex flex-wrap gap-2">
                    <Input
                      name="phone"
                      type="tel"
                      required
                      minLength={7}
                      placeholder={t("account.phonePlaceholder")}
                      aria-label={t("login.phone")}
                      className="h-11 w-auto min-w-0 flex-1 sm:max-w-xs"
                    />
                    <Button type="submit" variant="dark" loading={savingPhone}>
                      {savingPhone ? t("account.saving") : t("account.save")}
                    </Button>
                  </form>
                </div>
              ) : null}
            </AccountSection>

            <AccountSection id="seguridad" icon={KeyRound} title={t("account.security")}>
              <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t("account.changePasswordHint")}</p>
              {passwordError ? <Alert>{passwordError}</Alert> : null}
              <form onSubmit={handleChangePassword} className="grid max-w-md gap-4">
                <Field label={t("account.currentPassword")}>
                  {(control) => <Input {...control} type="password" name="currentPassword" autoComplete="current-password" required />}
                </Field>
                <Field label={t("account.newPassword")}>
                  {(control) => <Input {...control} type="password" name="newPassword" autoComplete="new-password" required minLength={8} />}
                </Field>
                <Field label={t("account.confirmNewPassword")}>
                  {(control) => <Input {...control} type="password" name="confirmPassword" autoComplete="new-password" required minLength={8} />}
                </Field>
                <div>
                  <Button type="submit" variant="dark" loading={changingPassword}>
                    {changingPassword ? t("account.saving") : t("account.changePassword")}
                  </Button>
                </div>
              </form>
            </AccountSection>
          </div>
        </div>
      ) : null}
    </Container>
  );
}
