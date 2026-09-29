"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { apiFetch, ApiError, uploadFile } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { AddressForm, type AddressFormValues } from "@/components/AddressForm";
import { PqrsTimeline } from "@/components/PqrsTimeline";
import { useT, useLocale } from "@/lib/i18n";
import type { Order, Pqrs, PqrsType, ShippingAddress, UserProfile } from "@/lib/types";

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
      let attachmentUrl: string | undefined;
      if (pqrsAttachment) {
        setUploadingAttachment(true);
        const { url } = await uploadFile<{ url: string }>("/uploads/pqrs-attachment", pqrsAttachment, token);
        attachmentUrl = url;
        setUploadingAttachment(false);
      }

      const created = await apiFetch<Pqrs>("/pqrs", {
        method: "POST",
        token,
        body: JSON.stringify({ type, subject, message, ...(orderId ? { orderId } : {}), ...(attachmentUrl ? { attachmentUrl } : {}) }),
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
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">{t("account.loginRequired")}</p>
        <Link href="/login" className="btn-primary mt-4 inline-block rounded-full px-4 py-2 text-sm">
          {t("account.login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{t("account.title")}</h1>

      {loading ? <p className="mt-4 text-muted-foreground">{t("account.loading")}</p> : null}
      {error ? <p className="mt-4 text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="mt-6 space-y-10">
          <section className="rounded-xl border border-border p-4">
            <h2 className="text-lg font-bold">{t("account.accountData")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{profile?.email}</p>
            {profile?.phone ? (
              <p className="mt-1 text-sm text-muted-foreground">{profile.phone}</p>
            ) : (
              <div className="mt-3 rounded-lg bg-muted p-3">
                <p className="text-sm font-semibold">{t("account.missingPhone")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("account.missingPhoneHint")}</p>
                {phoneError ? <p className="mt-1 text-sm text-red-600">{phoneError}</p> : null}
                <form onSubmit={handleSavePhone} className="mt-2 flex flex-wrap gap-2">
                  <input
                    name="phone"
                    type="tel"
                    required
                    minLength={7}
                    placeholder={t("account.phonePlaceholder")}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={savingPhone}
                    className="btn-primary rounded-full px-4 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingPhone ? t("account.saving") : t("account.save")}
                  </button>
                </form>
              </div>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {t("account.customerSince", { date: profile ? formatDate(profile.createdAt, locale) : "—" })}
            </p>
          </section>

          <section className="rounded-xl border border-border p-4">
            <h2 className="text-lg font-bold">{t("account.security")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("account.changePasswordHint")}</p>
            {passwordError ? <p className="mt-2 text-sm text-red-600">{passwordError}</p> : null}
            <form onSubmit={handleChangePassword} className="mt-3 max-w-sm space-y-3">
              <input
                type="password"
                name="currentPassword"
                placeholder={t("account.currentPassword")}
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <input
                type="password"
                name="newPassword"
                placeholder={t("account.newPassword")}
                required
                minLength={8}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder={t("account.confirmNewPassword")}
                required
                minLength={8}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={changingPassword}
                className="btn-primary rounded-full px-6 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {changingPassword ? t("account.saving") : t("account.changePassword")}
              </button>
            </form>
          </section>

          <section>
            <h2 className="text-lg font-bold">{t("account.myAddresses")}</h2>
            {addressError ? <p className="mt-2 text-sm text-red-600">{addressError}</p> : null}
            {addresses.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("account.noAddresses")}</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {addresses.map((address) =>
                  editingAddressId === address.id ? (
                    <div key={address.id} className="rounded-xl border border-border p-4">
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
                    <div key={address.id} className="rounded-xl border border-border p-4 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
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
                        <button
                          onClick={() => setEditingAddressId(address.id)}
                          className="shrink-0 text-sm font-semibold text-accent"
                        >
                          {t("account.edit")}
                        </button>
                      </div>
                      {address.updatedAt !== address.createdAt ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("account.lastModified", { date: formatDate(address.updatedAt, locale) })}
                        </p>
                      ) : null}
                    </div>
                  )
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-bold">{t("account.myOrders")}</h2>
            {orders.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("account.noOrders")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {orders.map((order) => {
                  const expanded = expandedOrders.has(order.id);
                  return (
                    <div key={order.id} className="rounded-xl border border-border">
                      <button
                        onClick={() => toggleOrder(order.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                      >
                        <div>
                          <p className="font-semibold">{t("account.orderNumber", { id: order.id.slice(-8) })}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt, locale)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">{formatCOP(order.totalAmount)}</span>
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                            {t(`orderStatus.${order.status}`)}
                          </span>
                          <ChevronDown
                            size={18}
                            className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {expanded ? (
                        <div className="border-t border-border p-4 pt-3">
                          <ul className="space-y-1 text-sm">
                            {order.items.map((item) => (
                              <li key={item.id} className="text-muted-foreground">
                                {item.quantity}× {item.product?.name ?? t("account.unnamedProduct")} — {formatCOP(item.priceAtPurchase)}
                                {item.discountLog ? (
                                  <span className="ml-1 text-xs text-accent">
                                    {t("account.includedDiscount", { percent: item.discountLog.discountPercentage })}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t("account.shippingCost", { amount: formatCOP(order.shippingCost) })}
                          </p>
                          <p className="mt-1 text-sm font-bold">{t("account.total", { amount: formatCOP(order.totalAmount) })}</p>
                          {order.status === "PENDING" ? (
                            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-accent/5 p-3 text-sm">
                              {order.expiresAt ? (
                                <span className="text-muted-foreground">
                                  {t("account.payBefore", {
                                    time: new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.expiresAt)),
                                  })}
                                </span>
                              ) : null}
                              <Link href={`/checkout/result?orderId=${order.id}`} className="btn-primary rounded-full px-4 py-1.5 text-sm">
                                {t("account.payNow")}
                              </Link>
                            </div>
                          ) : null}
                          {order.trackingNumber ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              {t("account.shippedBy", { carrier: order.carrier ?? "", tracking: order.trackingNumber })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("account.pqrsTitle")}</h2>
              {!showPqrsForm ? (
                <button onClick={() => setShowPqrsForm(true)} className="text-sm font-semibold text-accent">
                  {t("account.newRequest")}
                </button>
              ) : null}
            </div>

            {showPqrsForm ? (
              <form onSubmit={handleCreatePqrs} className="mt-3 space-y-3 rounded-xl border border-border p-4">
                {pqrsError ? <p className="text-sm text-red-600">{pqrsError}</p> : null}
                <select name="type" required className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                  {(["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"] as PqrsType[]).map((value) => (
                    <option key={value} value={value}>
                      {t(`pqrsType.${value}`)}
                    </option>
                  ))}
                </select>
                <input
                  name="subject"
                  placeholder={t("account.subject")}
                  required
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
                <textarea
                  name="message"
                  placeholder={t("account.messagePlaceholder")}
                  required
                  rows={3}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
                {orders.length > 0 ? (
                  <select name="orderId" className="w-full rounded-lg border border-border px-3 py-2 text-sm">
                    <option value="">{t("account.relateToOrderOptional")}</option>
                    {orders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {t("account.orderNumber", { id: order.id.slice(-8) })} — {formatDate(order.createdAt, locale)}
                      </option>
                    ))}
                  </select>
                ) : null}
                <label className="block text-sm text-muted-foreground">
                  {t("account.attachmentLabel")}
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    onChange={(e) => setPqrsAttachment(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-sm"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submittingPqrs}
                    className="btn-primary rounded-full px-6 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingAttachment ? t("account.uploadingAttachment") : submittingPqrs ? t("account.sending") : t("account.sendRequest")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPqrsForm(false)}
                    className="rounded-full border border-border px-6 py-2 text-sm text-muted-foreground"
                  >
                    {t("account.cancel")}
                  </button>
                </div>
              </form>
            ) : null}

            {pqrsList.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("account.noPqrs")}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {pqrsList.map((pqrs) => {
                  const expanded = expandedPqrs.has(pqrs.id);
                  return (
                    <div key={pqrs.id} className="rounded-xl border border-border">
                      <button
                        onClick={() => togglePqrs(pqrs.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                      >
                        <div>
                          <p className="font-semibold">
                            {t(`pqrsType.${pqrs.type}`)}: {pqrs.subject}
                          </p>
                          <p className="text-sm text-muted-foreground">{formatDate(pqrs.createdAt, locale)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                            {t(`pqrsStatus.${pqrs.status}`)}
                          </span>
                          <ChevronDown
                            size={18}
                            className={`text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {expanded ? (
                        <div className="border-t border-border p-4 pt-3 text-sm">
                          <p className="text-muted-foreground">{pqrs.message}</p>
                          {pqrs.attachmentUrl ? (
                            <a
                              href={pqrs.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block text-xs font-semibold text-accent underline"
                            >
                              {t("account.viewAttachment")}
                            </a>
                          ) : null}

                          <div className="mt-4">
                            <PqrsTimeline pqrs={pqrs} />
                          </div>

                          {pqrs.response ? (
                            <div className="mt-3 rounded-lg bg-muted p-3">
                              <p className="font-semibold">{t("account.response")}</p>
                              <p className="mt-1 text-muted-foreground">{pqrs.response}</p>
                              {pqrs.responseAttachmentUrl ? (
                                <a
                                  href={pqrs.responseAttachmentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-1 inline-block text-xs font-semibold text-accent underline"
                                >
                                  {t("account.viewResponseAttachment")}
                                </a>
                              ) : null}
                            </div>
                          ) : (
                            <p className="mt-3 text-muted-foreground">{t("account.noResponseYet")}</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
