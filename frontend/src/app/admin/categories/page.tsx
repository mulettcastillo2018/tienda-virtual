"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from "@/lib/categoryIcons";
import { useT } from "@/lib/i18n";
import type { Category } from "@/lib/types";

function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (icon: string) => void;
}) {
  return (
    <div className="grid max-h-32 w-full grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-8">
      {CATEGORY_ICON_OPTIONS.map((name) => {
        const OptionIcon = getCategoryIcon(name, "");
        const selected = value === name;
        return (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onChange(name)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              selected ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            <OptionIcon size={16} />
          </button>
        );
      })}
    </div>
  );
}

export default function AdminCategoriesPage() {
  const token = useAuthStore((state) => state.token);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();

  async function loadCategories() {
    const data = await apiFetch<Category[]>("/categories");
    setCategories(data);
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function startEditing(category: Category) {
    setEditingId(category.id);
    setEditIcon(category.icon);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    try {
      await apiFetch("/categories", {
        method: "POST",
        token,
        body: JSON.stringify({ name: field("name"), slug: field("slug"), icon: newIcon }),
      });
      form.reset();
      setNewIcon(null);
      await loadCategories();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminCategories.createError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setSaving(true);
    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    try {
      await apiFetch(`/categories/${id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ name: field("name"), slug: field("slug"), icon: editIcon }),
      });
      setEditingId(null);
      await loadCategories();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminCategories.updateError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    if (!confirm(t("adminCategories.confirmDelete"))) return;
    setError(null);
    try {
      await apiFetch(`/categories/${id}`, { method: "DELETE", token });
      await loadCategories();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminCategories.deleteError"));
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-peligro font-medium">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {categories.map((category) => {
          const CategoryIcon = getCategoryIcon(category.icon, category.slug);
          return editingId === category.id ? (
            <form
              key={category.id}
              onSubmit={(e) => handleUpdate(category.id, e)}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-border p-3 bg-surface shadow-suave"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-foreground/80">
                <CategoryIcon size={22} />
              </span>
              <input
                name="name"
                defaultValue={category.name}
                required
                className="w-full rounded-xl border border-border px-2.5 h-9 text-sm bg-surface"
              />
              <input
                name="slug"
                defaultValue={category.slug}
                required
                className="w-full rounded-xl border border-border px-2.5 h-9 text-sm bg-surface"
              />
              <IconPicker value={editIcon} onChange={setEditIcon} />
              <div className="flex w-full gap-2">
                <button type="submit" disabled={saving} className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada flex-1 rounded-full px-3 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                  {t("adminCategories.save")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="flex-1 rounded-full border border-border px-3 h-9 text-sm text-muted-foreground inline-flex items-center justify-center bg-surface font-medium transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  {t("adminCategories.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <div
              key={category.id}
              className="flex flex-col items-center gap-1 rounded-2xl border border-border p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevada bg-surface shadow-suave"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-foreground/80">
                <CategoryIcon size={22} />
              </span>
              <p className="line-clamp-2 text-sm font-semibold">{category.name}</p>
              <p className="text-xs text-muted-foreground">{category.slug}</p>
              <div className="mt-1 flex gap-3">
                <button onClick={() => startEditing(category)} className="text-xs font-semibold text-foreground underline-offset-4 hover:underline">
                  {t("adminCategories.edit")}
                </button>
                <button
                  onClick={() => handleDelete(category.id)}
                  className="text-xs font-semibold text-peligro"
                >
                  {t("adminCategories.delete")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border p-4 bg-surface shadow-suave">
        <h2 className="text-sm font-bold">{t("adminCategories.newCategory")}</h2>
        <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-start gap-2">
          <input name="name" placeholder={t("adminCategories.name")} required className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
          <input name="slug" placeholder={t("adminCategories.slug")} required className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface" />
          <div className="w-full max-w-xs sm:w-64">
            <IconPicker value={newIcon} onChange={setNewIcon} />
          </div>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? t("adminCategories.saving") : t("adminCategories.create")}
          </button>
        </form>
      </div>
    </div>
  );
}
