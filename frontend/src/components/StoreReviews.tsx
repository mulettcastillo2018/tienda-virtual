"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { StoreReviewsResponse } from "@/lib/types";

const ROTATE_MS = 6000;

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(rating) ? "fill-accent text-accent" : "text-border"} />
      ))}
    </div>
  );
}

export function StoreReviews() {
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
    <aside className="w-full rounded-2xl border border-border p-4">
      <h2 className="mb-2 text-sm font-extrabold tracking-tight">{t("reviews.title")}</h2>

      {data && data.total > 0 ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <StarRow rating={data.average} />
            <span className="text-xs font-semibold text-muted-foreground">
              {data.average.toFixed(1)} · {data.total} {data.total === 1 ? t("reviews.countOne") : t("reviews.countMany")}
            </span>
          </div>
          {current ? (
            <div key={current.id} className="animate-flash-in rounded-xl border border-border p-3">
              <StarRow rating={current.rating} />
              <p className="mt-1.5 line-clamp-4 text-xs text-muted-foreground">&ldquo;{current.comment}&rdquo;</p>
              <p className="mt-1.5 text-[11px] font-semibold">{current.customerLabel}</p>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{t("reviews.empty")}</p>
      )}

      {eligibleOrderId ? (
        showForm ? (
          <form onSubmit={handleSubmit} className="mt-3 space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold">{t("reviews.howWasIt")}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} aria-label={t("reviews.starsLabel", { n })}>
                  <Star size={20} className={n <= rating ? "fill-accent text-accent" : "text-border"} />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              required
              maxLength={500}
              rows={3}
              placeholder={t("reviews.placeholder")}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-xs outline-none focus:border-accent"
            />
            {submitError ? <p className="text-xs text-red-600">{submitError}</p> : null}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !comment.trim()}
                className="btn-primary flex-1 rounded-full px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? t("reviews.sending") : t("reviews.send")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
              >
                {t("reviews.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 w-full rounded-full border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
          >
            {t("reviews.rateButton")}
          </button>
        )
      ) : submitted ? (
        <p className="mt-3 text-xs font-semibold text-accent">{t("reviews.thankYou")}</p>
      ) : null}
    </aside>
  );
}
