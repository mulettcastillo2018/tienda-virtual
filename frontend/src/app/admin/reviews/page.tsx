"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { inputStyles } from "@/components/ui/Field";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Pagination } from "@/components/ui/Pagination";
import { StarRating } from "@/components/StarRating";
import type { AdminProductReview } from "@/lib/types";

const PAGE_SIZE = 20;
type Filter = "ALL" | "UNANSWERED" | "HIDDEN";

// Reseñas de producto: responder en público y ocultar solo lo ofensivo, con motivo.
export default function AdminReviewsPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("UNANSWERED");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ id: string; kind: "reply" | "hide" } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = usePagedList<{ items: AdminProductReview[]; total: number; counts: Record<Filter, number> }>(
    "/product-reviews",
    { page, pageSize: PAGE_SIZE, filter },
    t("adminReviews.loadError")
  );
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium" }).format(new Date(iso));

  async function run(id: string, path: string, body: object, toast: string) {
    setError(null);
    setBusy(id);
    try {
      await apiFetch(`/product-reviews/admin/${id}/${path}`, { method: "POST", token, body: JSON.stringify(body) });
      setForm(null);
      showToast(t(toast));
      list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminReviews.actionError"));
    } finally {
      setBusy(null);
    }
  }

  function handleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const value = (event.currentTarget.elements.namedItem("value") as HTMLTextAreaElement).value.trim();
    if (form.kind === "reply") return run(form.id, "reply", { reply: value }, "adminReviews.repliedToast");
    return run(form.id, "hide", { reason: value }, "adminReviews.hiddenToast");
  }

  const counts = list.data?.counts;
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("adminReviews.hint")}</p>
      <FilterTabs
        options={(["UNANSWERED", "HIDDEN", "ALL"] as const).map((value) => ({ value, label: t(`adminReviews.filter.${value}`), count: counts?.[value] ?? 0 }))}
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
      />
      {error || list.error ? <p className="text-sm font-medium text-peligro">{error ?? list.error}</p> : null}
      {list.data && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("adminReviews.empty")}</p>
      ) : null}

      {items.map((review) => (
        <div key={review.id} className={cn("rounded-2xl border bg-surface p-4 text-sm shadow-suave sm:p-5", review.hiddenAt ? "border-aviso/40" : "border-border")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link href={`/products/${review.product.id}#resenas`} className="font-semibold hover:underline">
                {review.product.name}
              </Link>
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {review.user.email} · {date(review.createdAt)}
              </p>
            </div>
            <span className="flex items-center gap-2">
              {review.hiddenAt ? <Badge tone="warning">{t("adminReviews.hidden")}</Badge> : null}
              <StarRating value={review.rating} />
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line">{review.comment}</p>
          {review.storeReply ? <p className="mt-2 rounded-xl bg-surface-2 p-3 text-muted-foreground">{t("adminReviews.yourReply", { reply: review.storeReply })}</p> : null}
          {review.hiddenReason ? <p className="mt-2 text-xs text-aviso">{t("adminReviews.hiddenReason", { reason: review.hiddenReason })}</p> : null}

          {form?.id === review.id ? (
            <form onSubmit={handleForm} className="mt-3 grid gap-2">
              <textarea
                name="value"
                required
                minLength={form.kind === "reply" ? 2 : 5}
                maxLength={form.kind === "reply" ? 1000 : 300}
                defaultValue={form.kind === "reply" ? (review.storeReply ?? "") : ""}
                placeholder={t(form.kind === "reply" ? "adminReviews.replyPlaceholder" : "adminReviews.hidePlaceholder")}
                className={cn(inputStyles, "min-h-20 py-2")}
              />
              <div className="flex gap-2">
                <Button type="submit" variant={form.kind === "hide" ? "danger" : "dark"} size="sm" loading={busy === review.id}>
                  {t(form.kind === "reply" ? "adminReviews.sendReply" : "adminReviews.confirmHide")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setForm(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="dark" size="sm" onClick={() => setForm({ id: review.id, kind: "reply" })}>
                {review.storeReply ? t("adminReviews.editReply") : t("adminReviews.reply")}
              </Button>
              {review.hiddenAt ? (
                <Button variant="secondary" size="sm" loading={busy === review.id} onClick={() => run(review.id, "unhide", {}, "adminReviews.shownToast")}>
                  {t("adminReviews.show")}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="hover:text-peligro" onClick={() => setForm({ id: review.id, kind: "hide" })}>
                  {t("adminReviews.hide")}
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
