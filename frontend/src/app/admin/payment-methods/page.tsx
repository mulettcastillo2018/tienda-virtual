"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { PaymentMethod } from "@/lib/types";

export default function AdminPaymentMethodsPage() {
  const token = useAuthStore((state) => state.token);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();

  async function loadMethods() {
    if (!token) return;
    const data = await apiFetch<PaymentMethod[]>("/payment-methods", { token });
    setMethods(data);
  }

  useEffect(() => {
    loadMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function readForm(form: HTMLFormElement) {
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const isActive = (form.elements.namedItem("isActive") as HTMLInputElement).checked;
    return {
      name: field("name"),
      logoUrl: field("logoUrl"),
      websiteUrl: field("websiteUrl"),
      sortOrder: Number(field("sortOrder") || 0),
      isActive,
    };
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/payment-methods", { method: "POST", token, body: JSON.stringify(readForm(event.currentTarget)) });
      setCreating(false);
      await loadMethods();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminPaymentMethods.createError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/payment-methods/${id}`, { method: "PUT", token, body: JSON.stringify(readForm(event.currentTarget)) });
      setEditingId(null);
      await loadMethods();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminPaymentMethods.updateError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm(t("adminPaymentMethods.confirmDelete"))) return;
    try {
      await apiFetch(`/payment-methods/${id}`, { method: "DELETE", token });
      await loadMethods();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminPaymentMethods.deleteError"));
    }
  }

  function MethodFields({ method }: { method?: PaymentMethod }) {
    return (
      <>
        <input name="name" defaultValue={method?.name} placeholder={t("common.name")} required className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
        <input name="logoUrl" defaultValue={method?.logoUrl} placeholder={t("adminPaymentMethods.logoUrlPlaceholder")} required className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
        <input name="websiteUrl" defaultValue={method?.websiteUrl} placeholder={t("common.websiteUrlPlaceholder")} required className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
        <input name="sortOrder" type="number" defaultValue={method?.sortOrder ?? 0} placeholder={t("common.order")} className="w-20 rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <input name="isActive" type="checkbox" defaultChecked={method?.isActive ?? true} />
          {t("common.active")}
        </label>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("adminPaymentMethods.hint")}</p>
      {error ? <p className="text-sm text-peligro font-medium">{error}</p> : null}

      <div className="space-y-2">
        {methods.map((method) =>
          editingId === method.id ? (
            <form
              key={method.id}
              onSubmit={(e) => handleUpdate(method.id, e)}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-border p-3 bg-surface shadow-suave"
            >
              <MethodFields method={method} />
              <button type="submit" disabled={saving} className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                {t("common.save")}
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-border px-4 h-9 text-sm text-muted-foreground inline-flex items-center justify-center bg-surface font-medium transition-colors hover:bg-surface-2 hover:text-foreground">
                {t("common.cancel")}
              </button>
            </form>
          ) : (
            <div key={method.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-3 bg-surface shadow-suave">
              <div className="flex items-center gap-3">
                <Image src={method.logoUrl} alt={method.name} width={64} height={20} className="h-5 w-auto object-contain" />
                <div>
                  <p className="font-semibold">
                    {method.name} {!method.isActive ? <span className="text-muted-foreground">{t("common.inactive")}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{method.websiteUrl}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingId(method.id)} className="text-sm font-semibold text-foreground underline-offset-4 hover:underline">
                  {t("common.edit")}
                </button>
                <button onClick={() => handleDelete(method.id)} className="text-sm font-semibold text-peligro">
                  {t("common.delete")}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border p-3 bg-surface shadow-suave">
          <MethodFields />
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? t("common.saving") : t("common.create")}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-full border border-border px-4 h-9 text-sm text-muted-foreground inline-flex items-center justify-center bg-surface font-medium transition-colors hover:bg-surface-2 hover:text-foreground">
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <button onClick={() => setCreating(true)} className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-10 text-sm disabled:cursor-not-allowed disabled:opacity-50">
          {t("adminPaymentMethods.addNew")}
        </button>
      )}
    </div>
  );
}
