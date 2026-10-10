"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Loader2, Plus } from "lucide-react";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { magnetic } from "@/lib/magnetic";
import { Badge } from "@/components/ui/Badge";
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
  // La segunda foto se precarga para el cambio al pasar el cursor; el resto, al interactuar.
  const [explored, setExplored] = useState(false);
  const t = useT();

  function previewImage(event: React.MouseEvent | React.FocusEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    setActiveImage(index);
  }

  const hasGallery = product.images.length > 1;
  const discounted = isDiscountActive(product);
  const soldOut = product.stock <= 0;
  const adding = addingId === product.id;
  const added = addedId === product.id;
  const buttonLabel = soldOut ? t("product.outOfStockTitle") : added ? t("product.added") : t("product.addToCart");

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col rounded-3xl border border-border bg-surface p-2 shadow-suave transition-[translate,box-shadow,border-color] duration-500 ease-salida hover:-translate-y-1 hover:border-border-strong hover:shadow-elevada"
      // Al pasar el cursor se ve la segunda foto; al salir vuelve la primera.
      onMouseEnter={() => {
        if (!hasGallery) return;
        setExplored(true);
        setActiveImage((current) => (current === 0 ? 1 : current));
      }}
      onFocus={() => setExplored(true)}
      onMouseLeave={() => setActiveImage(0)}
    >
      <div className="product-media relative aspect-[4/5] overflow-hidden rounded-[1.1rem]">
        {/* Fotos apiladas: la elegida aparece con un fundido y todas se acercan un poco */}
        <div className="absolute inset-0 transition-[scale] duration-700 ease-salida group-hover:scale-[1.04]">
          {product.images.map((image, index) =>
            index <= 1 || explored || index === activeImage ? (
              <Image
                key={image + index}
                src={image}
                alt={index === 0 ? product.name : ""}
                fill
                sizes="(min-width: 1280px) 290px, (min-width: 1024px) 23vw, (min-width: 768px) 31vw, 47vw"
                className={cn(
                  "object-cover transition-opacity duration-500 ease-salida",
                  index === 0 || index === activeImage ? "opacity-100" : "opacity-0",
                  soldOut && "grayscale-[70%]",
                )}
              />
            ) : null,
          )}
        </div>

        <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5">
          {isNew(product.createdAt) ? <Badge tone="dark">{t("product.new")}</Badge> : null}
          {discounted ? (
            <Badge className="bg-accent text-accent-foreground ring-accent">-{product.discountPercentage}%</Badge>
          ) : null}
          {soldOut ? <Badge className="bg-surface/90 text-foreground">{t("product.outOfStock")}</Badge> : null}
        </div>

        {hasGallery ? (
          // Indicadores de la galería: en escritorio aparecen al pasar el cursor; en celular siempre.
          <div className="absolute bottom-3 left-2.5 flex items-center rounded-full bg-black/30 px-1 transition-opacity duration-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
            {product.images.map((image, index) => (
              <button
                key={image + index}
                type="button"
                onMouseEnter={(e) => previewImage(e, index)}
                onFocus={(e) => previewImage(e, index)}
                onClick={(e) => previewImage(e, index)}
                aria-label={t("product.viewImage", { n: index + 1 })}
                aria-pressed={activeImage === index}
                className="flex h-6 items-center px-1"
              >
                <span
                  className={cn(
                    "block h-1 rounded-full transition-all duration-300 ease-salida",
                    activeImage === index ? "w-5 bg-white" : "w-1.5 bg-white/60",
                  )}
                />
              </button>
            ))}
          </div>
        ) : null}

        {/* Agregar: se acerca al cursor y se despliega con el texto al pasar por encima */}
        <button
          type="button"
          onClick={(e) => onAddToCart(e, product)}
          {...magnetic}
          disabled={soldOut || adding}
          title={buttonLabel}
          aria-label={buttonLabel}
          className={cn(
            "group/add absolute right-2.5 bottom-2.5 flex h-10 items-center rounded-full px-[11px] [&_svg]:size-[18px] [&_svg]:shrink-0",
            "transition-[translate,opacity,background-color,color,box-shadow] duration-300 ease-salida disabled:cursor-not-allowed",
            soldOut
              ? "bg-surface/90 text-muted-foreground shadow-suave"
              : added
                ? "bg-exito text-white shadow-flotante dark:text-background"
                : "bg-accent text-accent-foreground shadow-acento hover:brightness-110",
            // En escritorio aparece al pasar el cursor por la tarjeta; en celular siempre está visible.
            !added &&
              !adding &&
              "focus-visible:translate-y-0 focus-visible:opacity-100 [@media(hover:hover)]:translate-y-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100",
          )}
        >
          {adding ? <Loader2 className="animate-spin" /> : added ? <Check className="animate-salto" /> : <Plus />}
          {!added ? (
            <span className="max-w-0 overflow-hidden text-sm font-semibold whitespace-nowrap transition-[max-width,padding] duration-300 ease-salida group-hover/add:max-w-40 group-hover/add:pr-1 group-hover/add:pl-1.5">
              {buttonLabel}
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex flex-1 flex-col px-2 pt-3 pb-1.5">
        <h2 className="line-clamp-2 text-sm leading-snug font-semibold">{product.name}</h2>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{product.description}</p>

        <div className="mt-auto pt-3">
          {discounted ? (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-bold tracking-tight text-accent tabular-nums">{formatCOP(getEffectivePrice(product))}</span>
              <span className="text-xs text-muted-foreground tabular-nums line-through">{formatCOP(product.price)}</span>
            </p>
          ) : (
            <p className="text-base font-bold tracking-tight tabular-nums">{formatCOP(product.price)}</p>
          )}
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-[11px] font-medium",
              soldOut ? "text-peligro" : product.stock <= LOW_STOCK_THRESHOLD ? "text-accent" : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                soldOut ? "bg-peligro" : product.stock <= LOW_STOCK_THRESHOLD ? "animate-pulse bg-accent" : "bg-exito",
              )}
            />
            {soldOut
              ? t("product.outOfStock")
              : product.stock <= LOW_STOCK_THRESHOLD
                ? t("product.lowStock", { count: product.stock })
                : t("product.available", { count: product.stock })}
          </p>
        </div>
      </div>
    </Link>
  );
}
