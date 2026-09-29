"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Zap } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getEffectivePrice } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
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

export function FlashDeals() {
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
    <aside className="w-full rounded-2xl border border-border p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Zap size={16} className="fill-accent text-accent" />
        <h2 className="text-sm font-extrabold tracking-tight">{t("flashDeals.title")}</h2>
      </div>

      <div className="space-y-3">
        {visible.map((product) => (
          <Link
            key={`${product.id}-${startIndex}`}
            href={`/products/${product.id}`}
            className="animate-flash-in flex items-center gap-3 rounded-xl border border-border p-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
          >
            <div className="product-media relative aspect-square w-14 shrink-0 overflow-hidden rounded-lg">
              {product.images[0] ? (
                <Image src={product.images[0]} alt={product.name} fill sizes="56px" className="object-cover" />
              ) : null}
              <span className="absolute left-0 top-0 rounded-br-lg bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                -{product.discountPercentage}%
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-xs font-semibold">{product.name}</p>
              <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-sm font-extrabold">{formatCOP(getEffectivePrice(product))}</span>
                <span className="text-[11px] text-muted-foreground line-through">{formatCOP(product.price)}</span>
              </p>
              {product.discountEndsAt ? (
                <p className="mt-0.5 text-[10px] font-semibold text-accent">{formatTimeLeft(product.discountEndsAt, t)}</p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}
