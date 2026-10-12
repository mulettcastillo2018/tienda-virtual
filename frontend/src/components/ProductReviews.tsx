"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Star, Store } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { StarRating } from "@/components/StarRating";
import type { ProductReviewsPage } from "@/lib/types";

interface MyReview {
  canReview: boolean;
  review: { rating: number; comment: string; hiddenAt: string | null; hiddenReason: string | null } | null;
}

const PAGE_SIZE = 5;

/** Opiniones de compradores reales del producto, con la respuesta de la tienda. */
export function ProductReviews({ productId }: { productId: string }) {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const locale = useLocale();
  const [data, setData] = useState<ProductReviewsPage | null>(null);
  const [mine, setMine] = useState<MyReview | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function load(pageSize = PAGE_SIZE) {
    setData(await apiFetch<ProductReviewsPage>(`/product-reviews/${productId}?pageSize=${pageSize}`));
  }

  async function loadMine() {
    if (!token) return setMine(null);
    const result = await apiFetch<MyReview>(`/product-reviews/${productId}/mine`, { token });
    setMine(result);
    setRating(result.review?.rating ?? 0);
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    loadMine().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const comment = (event.currentTarget.elements.namedItem("comment") as HTMLTextAreaElement).value.trim();
    if (rating < 1) {
      setError(t("reviewsProduct.pickStars"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/product-reviews/${productId}`, { method: "PUT", token, body: JSON.stringify({ rating, comment }) });
      setEditing(false);
      showToast(t("reviewsProduct.savedToast"));
      await Promise.all([load(data?.items.length ? Math.max(data.items.length, PAGE_SIZE) : PAGE_SIZE), loadMine()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("reviewsProduct.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await apiFetch(`/product-reviews/${productId}`, { method: "DELETE", token });
      showToast(t("reviewsProduct.deletedToast"));
      await Promise.all([load(), loadMine()]);
    } finally {
      setSaving(false);
    }
  }

  async function loadMore() {
    if (!data) return;
    setLoadingMore(true);
    try {
      await load(data.items.length + PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }

  const summary = data?.summary;
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium" }).format(new Date(iso));
  const canWrite = Boolean(token && mine?.canReview);

  return (
    <section id="resenas" className="scroll-mt-28">
      <h2 className="text-lg font-bold tracking-tight">{t("reviewsProduct.title")}</h2>

      {summary && summary.count > 0 ? (
        <div className="mt-4 grid gap-5 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-5">
          <div>
            <p className="text-4xl font-extrabold tracking-tight tabular-nums">{summary.average?.toLocaleString(locale === "en" ? "en-US" : "es-CO")}</p>
            <StarRating value={summary.average ?? 0} size={16} label={t("reviewsProduct.averageLabel", { average: summary.average ?? 0 })} />
            <p className="mt-1 text-xs text-muted-foreground">{t("reviewsProduct.count", { n: summary.count })}</p>
          </div>
          <ul className="grid gap-1.5 text-xs">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = summary.distribution[stars] ?? 0;
              return (
                <li key={stars} className="flex items-center gap-2">
                  <span className="flex w-8 items-center gap-0.5 tabular-nums">
                    {stars}
                    <Star size={11} aria-hidden className="fill-aviso text-aviso" />
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span className="block h-full rounded-full bg-aviso" style={{ width: `${(count / summary.count) * 100}%` }} />
                  </span>
                  <span className="w-6 text-right text-muted-foreground tabular-nums">{count}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t("reviewsProduct.empty")}</p>
      )}

      {/* El comprador: escribir, editar o borrar su opinión */}
      {canWrite ? (
        editing || !mine?.review ? (
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold">{mine?.review ? t("reviewsProduct.editTitle") : t("reviewsProduct.writeTitle")}</p>
            <div className="flex gap-1" role="radiogroup" aria-label={t("reviewsProduct.starsLabel")}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={t("reviewsProduct.starsValue", { n: value })}
                  onClick={() => setRating(value)}
                  className="rounded-md p-0.5 transition-transform hover:scale-110"
                >
                  <Star size={24} aria-hidden className={cn(value <= rating ? "fill-aviso text-aviso" : "text-border-strong")} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <Field label={t("reviewsProduct.commentLabel")}>
              {(control) => <Textarea {...control} name="comment" required minLength={3} maxLength={1000} defaultValue={mine?.review?.comment ?? ""} className="min-h-24" />}
            </Field>
            {error ? <p className="text-sm font-medium text-peligro">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="dark" size="sm" loading={saving}>
                {t("reviewsProduct.publish")}
              </Button>
              {mine?.review ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  {t("common.cancel")}
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
            <span className="flex items-center gap-2">
              {t("reviewsProduct.yours")} <StarRating value={mine.review.rating} />
            </span>
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                {t("common.edit")}
              </Button>
              <Button variant="ghost" size="sm" loading={saving} onClick={handleDelete} className="hover:text-peligro">
                {t("common.delete")}
              </Button>
            </span>
            {mine.review.hiddenAt ? <p className="basis-full text-xs text-aviso">{t("reviewsProduct.hiddenNotice", { reason: mine.review.hiddenReason ?? "" })}</p> : null}
          </div>
        )
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">{t("reviewsProduct.onlyBuyers")}</p>
      )}

      {data && data.items.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {data.items.map((review) => (
            <li key={review.id} className="rounded-2xl border border-border bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StarRating value={review.rating} />
                <span className="text-xs text-muted-foreground">
                  {review.author} · {t("reviewsProduct.verified")} · {date(review.createdAt)}
                </span>
              </div>
              <p className="mt-2 leading-relaxed whitespace-pre-line">{review.comment}</p>
              {review.storeReply ? (
                <div className="mt-3 rounded-xl bg-surface-2 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Store size={13} aria-hidden />
                    {t("reviewsProduct.storeReply")}
                  </p>
                  <p className="mt-1 text-muted-foreground">{review.storeReply}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {data && data.items.length < data.total ? (
        <Button variant="secondary" size="sm" className="mt-3" loading={loadingMore} onClick={loadMore}>
          {t("reviewsProduct.more")}
        </Button>
      ) : null}
    </section>
  );
}
