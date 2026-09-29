"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { SocialLink } from "@/lib/types";

export default function AdminSocialLinksPage() {
  const token = useAuthStore((state) => state.token);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();

  async function loadLinks() {
    if (!token) return;
    const data = await apiFetch<SocialLink[]>("/social-links", { token });
    setLinks(data);
  }

  useEffect(() => {
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function readForm(form: HTMLFormElement) {
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const isActive = (form.elements.namedItem("isActive") as HTMLInputElement).checked;
    return {
      name: field("name"),
      iconUrl: field("iconUrl"),
      url: field("url"),
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
      await apiFetch("/social-links", { method: "POST", token, body: JSON.stringify(readForm(event.currentTarget)) });
      setCreating(false);
      await loadLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminSocialLinks.createError"));
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
      await apiFetch(`/social-links/${id}`, { method: "PUT", token, body: JSON.stringify(readForm(event.currentTarget)) });
      setEditingId(null);
      await loadLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminSocialLinks.updateError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm(t("adminSocialLinks.confirmDelete"))) return;
    try {
      await apiFetch(`/social-links/${id}`, { method: "DELETE", token });
      await loadLinks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminSocialLinks.deleteError"));
    }
  }

  function LinkFields({ link }: { link?: SocialLink }) {
    return (
      <>
        <input name="name" defaultValue={link?.name} placeholder={t("adminSocialLinks.namePlaceholder")} required className="rounded-lg border border-border px-2 py-1 text-sm" />
        <input name="iconUrl" defaultValue={link?.iconUrl} placeholder={t("adminSocialLinks.iconUrlPlaceholder")} required className="rounded-lg border border-border px-2 py-1 text-sm" />
        <input name="url" defaultValue={link?.url} placeholder={t("adminSocialLinks.urlPlaceholder")} required className="rounded-lg border border-border px-2 py-1 text-sm" />
        <input name="sortOrder" type="number" defaultValue={link?.sortOrder ?? 0} placeholder={t("common.order")} className="w-20 rounded-lg border border-border px-2 py-1 text-sm" />
        <label className="flex items-center gap-1 text-sm text-muted-foreground">
          <input name="isActive" type="checkbox" defaultChecked={link?.isActive ?? true} />
          {t("common.active")}
        </label>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("adminSocialLinks.hint")}</p>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-2">
        {links.map((link) =>
          editingId === link.id ? (
            <form
              key={link.id}
              onSubmit={(e) => handleUpdate(link.id, e)}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3"
            >
              <LinkFields link={link} />
              <button type="submit" disabled={saving} className="btn-primary rounded-full px-4 py-1 text-sm">
                {t("common.save")}
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-full border border-border px-4 py-1 text-sm text-muted-foreground">
                {t("common.cancel")}
              </button>
            </form>
          ) : (
            <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div className="flex items-center gap-3">
                <Image src={link.iconUrl} alt={link.name} width={24} height={24} className="h-6 w-6 object-contain" />
                <div>
                  <p className="font-semibold">
                    {link.name} {!link.isActive ? <span className="text-muted-foreground">{t("common.inactive")}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{link.url}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingId(link.id)} className="text-sm font-semibold text-accent">
                  {t("common.edit")}
                </button>
                <button onClick={() => handleDelete(link.id)} className="text-sm font-semibold text-red-600">
                  {t("common.delete")}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
          <LinkFields />
          <button type="submit" disabled={saving} className="btn-primary rounded-full px-4 py-1 text-sm">
            {saving ? t("common.saving") : t("common.create")}
          </button>
          <button type="button" onClick={() => setCreating(false)} className="rounded-full border border-border px-4 py-1 text-sm text-muted-foreground">
            {t("common.cancel")}
          </button>
        </form>
      ) : (
        <button onClick={() => setCreating(true)} className="btn-primary rounded-full px-4 py-2 text-sm">
          {t("adminSocialLinks.addNew")}
        </button>
      )}
    </div>
  );
}
