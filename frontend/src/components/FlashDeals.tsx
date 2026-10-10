"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Clock, Zap } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getEffectivePrice } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

function formatTimeLeft(endsAt: string, t: ReturnType<typeof useT>): string {
  const msLeft = new Date(endsAt).getTime() - Date.now();
  if (msLeft <= 0) return t("flashDeals.endsSoon");
  const hours = Math.floor(msLeft / (1000 * 60 * 60));
  if (hours < 1) return t("flashDeals.endsInLessThanHour");
  if (hours < 24) return t("flashDeals.endsInHours", { hours });
  return t("flashDeals.endsInDays", { days: Math.floor(hours / 24) });
}

const VISIBLE_COUNT = 3;
const ROTATE_MS = 4000;

export function FlashDeals({ className }: { className?: string }) {
  const [deals, setDeals] = useState<Product[]>([]);
  const [startIndex, setStartIndex] = useState(0);
  const t = useT();

  useEffect(() => {
    apiFetch<{ items: Product[] }>("/products?onSale=true&pageSize=15")
      .then((data) => setDeals(data.items))
      .catch(() => {
        /* si falla, simplemente no se muestra el panel de ofertas */
      });
  }, []);

  useEffect(() => {
    if (deals.length <= VISIBLE_COUNT) return;
    const timer = setInterval(() => {
      setStartIndex((current) => (current + 1) % deals.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [deals.length]);

  if (deals.length === 0) return null;

  const visible = Array.from({ length: Math.min(VISIBLE_COUNT, deals.length) }, (_, i) => deals[(startIndex + i) % deals.length]);

  return (
    <aside
      data-celda="ofertas"
      className={cn("relative isolate overflow-hidden rounded-[2rem] border border-border bg-surface p-4 shadow-suave sm:p-5", className)}
    >
      {/* Luces de color detrás: el vidrio de cada oferta las difumina */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -top-20 -right-12 size-60 rounded-full bg-accent/45 blur-3xl" />
        <div className="absolute top-1/3 left-1/4 size-44 rounded-full bg-accent-3/25 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 size-64 rounded-full bg-accent-2/35 blur-3xl" />
      </div>

      <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-acento">
          <Zap size={14} className="fill-current" />
        </span>
        {t("flashDeals.title")}
      </h2>

      <div className="space-y-2">
        {visible.map((product) => (
          <Link
            key={`${product.id}-${startIndex}`}
            href={`/products/${product.id}`}
            className="vidrio animate-flash-in flex items-center gap-3 rounded-2xl p-2 pr-3 shadow-suave transition-[translate,box-shadow] duration-300 ease-salida hover:-translate-y-0.5 hover:shadow-elevada"
          >
            <div className="product-media relative size-16 shrink-0 overflow-hidden rounded-xl">
              {product.images[0] ? (
                <Image src={product.images[0]} alt={product.name} fill sizes="64px" className="object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-xs font-semibold">{product.name}</p>
              <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-sm font-bold text-accent tabular-nums">{formatCOP(getEffectivePrice(product))}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums line-through">{formatCOP(product.price)}</span>
              </p>
              {product.discountEndsAt ? (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                  <Clock size={11} aria-hidden />
                  {formatTimeLeft(product.discountEndsAt, t)}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 rounded-full bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground tabular-nums">
              -{product.discountPercentage}%
            </span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
