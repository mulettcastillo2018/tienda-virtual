"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Quote, Star } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import type { StoreReviewsResponse } from "@/lib/types";

const ROTATE_MS = 6000;

function StarRow({ rating, size = 14, className }: { rating: number; size?: number; className?: string }) {
  return (
    <div className={cn("flex gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(rating) ? "fill-accent text-accent" : "text-border-strong"} />
      ))}
    </div>
  );
}

export function StoreReviews({ className }: { className?: string }) {
  const [data, setData] = useState<StoreReviewsResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [eligibleOrderId, setEligibleOrderId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const token = useAuthStore((state) => state.token);
  const t = useT();

  function loadReviews() {
    apiFetch<StoreReviewsResponse>("/store-reviews?pageSize=15")
      .then((res) => {
        setData(res);
        setIndex(0);
      })
      .catch(() => {
        /* si falla, simplemente no se muestra el panel de reseñas */
      });
  }

  useEffect(() => {
    loadReviews();
  }, []);

  useEffect(() => {
    if (!token) {
      setEligibleOrderId(null);
      return;
    }
    apiFetch<{ eligibleOrderId: string | null }>("/store-reviews/eligibility", { token })
      .then((res) => setEligibleOrderId(res.eligibleOrderId))
      .catch(() => setEligibleOrderId(null));
  }, [token]);

  useEffect(() => {
    if (!data || data.items.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % data.items.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [data]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!eligibleOrderId || !token || !comment.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch("/store-reviews", {
        method: "POST",
        token,
        body: JSON.stringify({ orderId: eligibleOrderId, rating, comment: comment.trim() }),
      });
      setSubmitted(true);
      setShowForm(false);
      setEligibleOrderId(null);
      setComment("");
      setRating(5);
      loadReviews();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : t("reviews.submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  const current = data?.items[index];

  return (
    <aside
      data-celda="resenas"
      className={cn("flex flex-col rounded-[2rem] border border-border bg-surface p-5 shadow-suave", className)}
    >
      <h2 className="text-sm font-bold tracking-tight">{t("reviews.title")}</h2>

      {data && data.total > 0 ? (
        <div className="flex flex-1 flex-col">
          <div className="mt-3 flex items-end gap-3">
            <span className="text-4xl leading-none font-extrabold tracking-tight tabular-nums">{data.average.toFixed(1)}</span>
            <div>
              <StarRow rating={data.average} size={15} />
              <p className="mt-1 text-xs text-muted-foreground">
                {data.total} {data.total === 1 ? t("reviews.countOne") : t("reviews.countMany")}
              </p>
            </div>
          </div>
          {current ? (
            <figure key={current.id} className="animate-flash-in relative mt-4 flex-1 rounded-2xl bg-surface-2 p-4">
              <Quote aria-hidden className="absolute top-3 right-3 size-7 fill-accent/15 text-transparent" />
              <StarRow rating={current.rating} size={12} />
              <blockquote className="mt-2 line-clamp-4 text-sm leading-relaxed text-foreground/85">&ldquo;{current.comment}&rdquo;</blockquote>
              <figcaption className="mt-2 text-xs font-semibold text-muted-foreground">— {current.customerLabel}</figcaption>
            </figure>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-border px-4 py-6 text-center">
          <StarRow rating={0} size={18} />
          <p className="max-w-56 text-xs leading-relaxed text-muted-foreground">{t("reviews.empty")}</p>
        </div>
      )}

      {eligibleOrderId ? (
        showForm ? (
          <form onSubmit={handleSubmit} className="animate-aparecer mt-4 grid gap-3 border-t border-border pt-4">
            <p className="text-sm font-semibold">{t("reviews.howWasIt")}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={t("reviews.starsLabel", { n })}
                  aria-pressed={n === rating}
                  className="rounded-md p-0.5 transition-[scale] duration-200 ease-resorte hover:scale-115"
                >
                  <Star size={24} className={n <= rating ? "fill-accent text-accent" : "text-border-strong"} />
                </button>
              ))}
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required
              maxLength={500}
              rows={3}
              placeholder={t("reviews.placeholder")}
              aria-label={t("reviews.howWasIt")}
              className="min-h-24"
            />
            {submitError ? <p className="text-xs font-medium text-peligro">{submitError}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" variant="dark" size="sm" disabled={submitting || !comment.trim()} className="flex-1">
                {submitting ? t("reviews.sending") : t("reviews.send")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                {t("reviews.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" size="sm" block onClick={() => setShowForm(true)} className="mt-4">
            {t("reviews.rateButton")}
          </Button>
        )
      ) : submitted ? (
        <p className="mt-4 text-sm font-semibold text-exito">{t("reviews.thankYou")}</p>
      ) : null}
    </aside>
  );
}
