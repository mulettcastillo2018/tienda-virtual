"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import type { Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

const LOW_STOCK_THRESHOLD = 5;

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<"idle" | "adding" | "added">("idle");
  const [activeImage, setActiveImage] = useState(0);
  const token = useAuthStore((state) => state.token);
  const addItem = useCartStore((state) => state.addItem);
  const t = useT();

  useEffect(() => {
    apiFetch<Product>(`/products/${id}`).then((data) => {
      setProduct(data);
      setActiveImage(0);
    });
  }, [id]);

  async function handleAddToCart() {
    if (!token) {
      router.push("/login");
      return;
    }
    setStatus("adding");
    await addItem(product!.id, 1);
    setStatus("added");
  }

  if (!product) return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{t("common.loading")}</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <div className="product-media relative aspect-square overflow-hidden rounded-2xl">
            {product.images[activeImage] ? (
              <Image
                src={product.images[activeImage]}
                alt={product.name}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover transition-opacity duration-200"
                priority
              />
            ) : null}
          </div>
          {product.images.length > 1 ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {product.images.map((image, index) => (
                <button
                  key={image + index}
                  type="button"
                  onMouseEnter={() => setActiveImage(index)}
                  onFocus={() => setActiveImage(index)}
                  onClick={() => setActiveImage(index)}
                  aria-label={t("product.viewImage", { n: index + 1 })}
                  className={`product-media relative aspect-square overflow-hidden rounded-xl border-2 transition-colors ${
                    activeImage === index ? "border-accent" : "border-transparent hover:border-accent/50"
                  }`}
                >
                  <Image src={image} alt="" fill sizes="120px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{product.name}</h1>
          {isDiscountActive(product) ? (
            <div className="mt-3 flex items-baseline gap-3">
              <p className="text-3xl font-extrabold">{formatCOP(getEffectivePrice(product))}</p>
              <p className="text-lg text-muted-foreground line-through">{formatCOP(product.price)}</p>
              <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
                -{product.discountPercentage}%
              </span>
            </div>
          ) : (
            <p className="mt-3 text-3xl font-extrabold">{formatCOP(product.price)}</p>
          )}
          <p className="mt-4 text-muted-foreground">{product.description}</p>
          {product.stock > 0 ? (
            <p className={`mt-4 text-sm font-semibold ${product.stock <= LOW_STOCK_THRESHOLD ? "text-accent" : "text-muted-foreground"}`}>
              {product.stock <= LOW_STOCK_THRESHOLD
                ? t("product.lowStock", { count: product.stock })
                : t("product.available", { count: product.stock })}
            </p>
          ) : (
            <p className="mt-4 text-sm font-semibold text-red-600">{t("product.outOfStock")}</p>
          )}

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0 || status === "adding"}
            className="btn-primary mt-6 w-full rounded-full px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "added" ? t("product.added") : status === "adding" ? t("product.adding") : t("product.addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
}
