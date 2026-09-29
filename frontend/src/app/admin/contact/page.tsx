"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT } from "@/lib/i18n";
import type { ContactInfo } from "@/lib/types";

export default function AdminContactPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();

  useEffect(() => {
    apiFetch<ContactInfo>("/contact-info").then(setInfo);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const field = (name: string) => (event.currentTarget.elements.namedItem(name) as HTMLInputElement).value;
    const data = {
      phone: field("phone"),
      whatsapp: field("whatsapp"),
      email: field("email"),
      address: field("address"),
    };

    setError(null);
    setSaving(true);
    try {
      const updated = await apiFetch<ContactInfo>("/contact-info", {
        method: "PUT",
        token,
        body: JSON.stringify(data),
      });
      setInfo(updated);
      showToast(t("adminContact.updatedToast"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminContact.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!info) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">{t("adminContact.hint")}</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">{t("adminContact.phone")}</label>
          <input
            name="phone"
            defaultValue={info.phone}
            required
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("adminContact.whatsapp")}</label>
          <input
            name="whatsapp"
            defaultValue={info.whatsapp}
            required
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("adminContact.email")}</label>
          <input
            name="email"
            type="email"
            defaultValue={info.email}
            required
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("adminContact.address")}</label>
          <input
            name="address"
            defaultValue={info.address}
            required
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-full px-6 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? t("common.saving") : t("adminContact.saveChanges")}
        </button>
      </form>
    </div>
  );
}
