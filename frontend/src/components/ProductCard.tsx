"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import type { Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

const NEW_BADGE_MAX_DAYS = 16;
const LOW_STOCK_THRESHOLD = 5;

function isNew(createdAt: string) {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return days <= NEW_BADGE_MAX_DAYS;
}

interface ProductCardProps {
  product: Product;
  addingId: string | null;
  addedId: string | null;
  onAddToCart: (event: React.MouseEvent, product: Product) => void;
}

export function ProductCard({ product, addingId, addedId, onAddToCart }: ProductCardProps) {
  const [activeImage, setActiveImage] = useState(0);
  const t = useT();

  function previewImage(event: React.MouseEvent | React.FocusEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setActiveImage(index);
  }

  return (
    <Link
      href={`/products/${product.id}`}
      className="product-card group block bg-background"
      onMouseLeave={() => setActiveImage(0)}
    >
      <div className="product-media relative aspect-square overflow-hidden">
        {product.images[activeImage] ? (
          <Image
            src={product.images[activeImage]}
            alt={product.name}
            fill
            sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 768px) 33vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
        {isNew(product.createdAt) ? (
          <span className="badge-new absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold">
            {t("product.new")}
          </span>
        ) : null}
        {isDiscountActive(product) ? (
          <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
            -{product.discountPercentage}%
          </span>
        ) : null}
        <button
          onClick={(e) => onAddToCart(e, product)}
          disabled={product.stock <= 0 || addingId === product.id}
          title={product.stock <= 0 ? t("product.outOfStockTitle") : t("product.addToCart")}
          className="btn-primary absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addedId === product.id ? <Check size={15} /> : <Plus size={15} />}
        </button>
      </div>

      {product.images.length > 1 ? (
        <div className="grid grid-cols-4 gap-1 p-1.5 pb-0">
          {product.images.map((image, index) => (
            <button
              key={image + index}
              type="button"
              onMouseEnter={(e) => previewImage(e, index)}
              onFocus={(e) => previewImage(e, index)}
              onClick={(e) => previewImage(e, index)}
              aria-label={t("product.viewImage", { n: index + 1 })}
              className={`product-media relative aspect-square overflow-hidden rounded-md border transition-colors ${
                activeImage === index ? "border-accent" : "border-transparent opacity-80 hover:opacity-100"
              }`}
            >
              <Image src={image} alt="" fill sizes="60px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="p-3">
        <h2 className="text-sm font-bold">{product.name}</h2>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{product.description}</p>
        {isDiscountActive(product) ? (
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-base font-extrabold">{formatCOP(getEffectivePrice(product))}</span>
            <span className="text-xs text-muted-foreground line-through">{formatCOP(product.price)}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-base font-extrabold">{formatCOP(product.price)}</p>
        )}
        {product.stock > 0 ? (
          <p className={`mt-1 text-xs font-semibold ${product.stock <= LOW_STOCK_THRESHOLD ? "text-accent" : "text-muted-foreground"}`}>
            {product.stock <= LOW_STOCK_THRESHOLD
              ? t("product.lowStock", { count: product.stock })
              : t("product.available", { count: product.stock })}
          </p>
        ) : (
          <p className="mt-1 text-xs font-semibold text-red-600">{t("product.outOfStock")}</p>
        )}
      </div>
    </Link>
  );
}
