"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { getEffectivePrice, isDiscountActive } from "@/lib/pricing";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { magnetic } from "@/lib/magnetic";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

function formatWeight(grams: number) {
  if (grams < 1000) return `${grams} g`;
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(grams / 1000)} kg`;
}

// Lupa: el punto bajo el cursor es el centro del acercamiento (solo visual, sin estado).
function zoomAt(event: React.MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--zx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  event.currentTarget.style.setProperty("--zy", `${((event.clientY - rect.top) / rect.height) * 100}%`);
}

const LOW_STOCK_THRESHOLD = 5;
const LAYOUT = "grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-x-12 lg:gap-y-12";

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

  if (!product) {
    return (
      <Container className="pt-4 pb-16 sm:pt-6">
        <p role="status" className="sr-only">
          {t("common.loading")}
        </p>
        <Skeleton className="mb-5 h-4 w-40" />
        <div className={LAYOUT}>
          <Skeleton className="aspect-square rounded-[2rem]" />
          <div className="grid content-start gap-4 rounded-[2rem] border border-border bg-surface p-6 sm:p-8">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-4/5" />
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="mt-4 h-13 w-full rounded-full" />
          </div>
        </div>
      </Container>
    );
  }

  const discounted = isDiscountActive(product);
  const soldOut = product.stock <= 0;
  const lowStock = !soldOut && product.stock <= LOW_STOCK_THRESHOLD;
  const buttonLabel = status === "added" ? t("product.added") : status === "adding" ? t("product.adding") : t("product.addToCart");
  const eyebrow = [product.category?.name, product.brand].filter(Boolean).join(" · ");
  const hasDimensions = product.widthCm > 0 && product.heightCm > 0 && product.depthCm > 0;
  const specs: [string, string][] = [
    ...(product.brand ? [[t("product.brand"), product.brand] as [string, string]] : []),
    ...(product.sku ? [[t("product.sku"), product.sku] as [string, string]] : []),
    ...(product.weightInGrams > 0 ? [[t("product.weight"), formatWeight(product.weightInGrams)] as [string, string]] : []),
    ...(hasDimensions
      ? [[t("product.dimensions"), `${product.widthCm} × ${product.heightCm} × ${product.depthCm} cm`] as [string, string]]
      : []),
  ];

  const stockLine = (
    <p
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        soldOut ? "text-peligro" : lowStock ? "text-accent" : "text-muted-foreground",
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", soldOut ? "bg-peligro" : lowStock ? "animate-pulse bg-accent" : "bg-exito")} />
      {soldOut
        ? t("product.outOfStock")
        : lowStock
          ? t("product.lowStock", { count: product.stock })
          : t("product.available", { count: product.stock })}
    </p>
  );

  return (
    // En celular se deja espacio extra abajo para la barra de compra fija.
    <Container className="pt-4 pb-28 sm:pt-6 md:pb-16">
      <nav aria-label={t("product.breadcrumb")} className="mb-4 flex min-w-0 items-center gap-1.5 px-1 text-sm text-muted-foreground sm:mb-5">
        <Link href="/" className="shrink-0 transition-colors hover:text-foreground">
          {t("nav.catalog")}
        </Link>
        {product.category ? (
          <>
            <ChevronRight size={14} aria-hidden className="shrink-0" />
            <span className="truncate">{product.category.name}</span>
          </>
        ) : null}
      </nav>

      <div className={LAYOUT}>
        {/* Galería: miniaturas en columna (escritorio) o en fila (celular) y foto grande con lupa */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1 lg:flex-row lg:items-start lg:gap-4">
          <div
            className="group/zoom product-media relative aspect-square min-w-0 overflow-hidden rounded-[2rem] lg:flex-1 [@media(hover:hover)]:cursor-zoom-in"
            onMouseMove={zoomAt}
          >
            <div className="absolute inset-0 origin-[var(--zx,50%)_var(--zy,50%)] transition-[scale] duration-300 ease-salida [@media(hover:hover)]:group-hover/zoom:scale-[1.8]">
              {product.images.map((image, index) => (
                <Image
                  key={image + index}
                  src={image}
                  alt={index === 0 ? product.name : ""}
                  fill
                  sizes="(min-width: 1024px) 1100px, 100vw"
                  priority={index === 0}
                  className={cn(
                    "object-cover transition-opacity duration-500 ease-salida",
                    index === 0 || index === activeImage ? "opacity-100" : "opacity-0",
                  )}
                />
              ))}
            </div>
            {discounted ? (
              <Badge className="absolute top-4 left-4 bg-accent px-3 py-1.5 text-xs text-accent-foreground ring-accent">
                -{product.discountPercentage}%
              </Badge>
            ) : null}
            {product.images.length > 1 ? (
              <span className="absolute right-4 bottom-4 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-white tabular-nums lg:hidden">
                {activeImage + 1} / {product.images.length}
              </span>
            ) : null}
          </div>

          {product.images.length > 1 ? (
            <div className="no-scrollbar flex gap-2.5 overflow-x-auto p-1 lg:order-first lg:flex-col lg:overflow-visible">
              {product.images.map((image, index) => (
                <button
                  key={image + index}
                  type="button"
                  onMouseEnter={() => setActiveImage(index)}
                  onFocus={() => setActiveImage(index)}
                  onClick={() => setActiveImage(index)}
                  aria-label={t("product.viewImage", { n: index + 1 })}
                  aria-pressed={activeImage === index}
                  className={cn(
                    "product-media relative size-16 shrink-0 overflow-hidden rounded-2xl ring-2 ring-offset-2 ring-offset-background transition-[box-shadow,opacity] duration-200 sm:size-20",
                    activeImage === index ? "ring-foreground" : "opacity-70 ring-transparent hover:opacity-100",
                  )}
                >
                  <Image src={image} alt="" fill sizes="80px" className="object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Caja de compra: fija al hacer scroll en escritorio */}
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="rounded-[2rem] border border-border bg-surface p-5 shadow-suave sm:p-8 lg:sticky lg:top-24">
            {eyebrow ? <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p> : null}
            <h1 className="mt-2 text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">{product.name}</h1>

            {discounted ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-3xl font-bold tracking-tight text-accent tabular-nums">{formatCOP(getEffectivePrice(product))}</p>
                <p className="text-lg text-muted-foreground tabular-nums line-through">{formatCOP(product.price)}</p>
                <Badge className="bg-accent text-accent-foreground ring-accent">-{product.discountPercentage}%</Badge>
              </div>
            ) : (
              <p className="mt-4 text-3xl font-bold tracking-tight tabular-nums">{formatCOP(product.price)}</p>
            )}

            <div className="mt-3">{stockLine}</div>

            {/* En celular el botón vive en la barra fija de abajo */}
            <div className="mt-6 hidden gap-2.5 md:grid">
              <Button size="lg" block onClick={handleAddToCart} disabled={product.stock === 0} loading={status === "adding"} {...magnetic}>
                {buttonLabel}
              </Button>
              {status === "added" ? (
                <Link href="/cart" className={cn(buttonStyles({ variant: "secondary", size: "lg", block: true }), "animate-aparecer")}>
                  {t("product.goToCart")}
                </Link>
              ) : null}
            </div>

            <ul className="mt-6 grid gap-1 border-t border-border pt-5 text-sm">
              <li className="flex items-center gap-3 py-1.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-exito/10 text-exito">
                  <ShieldCheck size={17} aria-hidden />
                </span>
                <span className="font-medium">{t("home.trustPayment")}</span>
              </li>
              {[
                { href: "/envios", Icon: Truck, label: t("home.trustShipping") },
                { href: "/devoluciones", Icon: RotateCcw, label: t("home.trustReturns") },
              ].map(({ href, Icon, label }) => (
                <li key={href}>
                  <Link href={href} className="group flex items-center gap-3 rounded-xl py-1.5 transition-colors hover:text-foreground">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground/80">
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="font-medium">{label}</span>
                    <ChevronRight
                      size={16}
                      aria-hidden
                      className="ml-auto text-muted-foreground transition-[translate] duration-200 group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Descripción y ficha técnica, bajo la galería */}
        <div className="grid content-start gap-8 lg:col-start-1 lg:row-start-2">
          <section>
            <h2 className="text-lg font-bold tracking-tight">{t("product.description")}</h2>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-muted-foreground">{product.description}</p>
          </section>
          {specs.length > 0 ? (
            <section>
              <h2 className="text-lg font-bold tracking-tight">{t("product.details")}</h2>
              <dl className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
                {specs.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 px-4 py-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>

      {/* Celular: barra de compra fija sobre las pestañas, al alcance del pulgar */}
      <div
        data-barra-compra
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex h-[4.5rem] items-center gap-3 border-t border-border bg-surface px-4 shadow-[0_-12px_30px_-18px_rgb(0_0_0/0.3)] md:hidden print:hidden"
      >
        <div className="min-w-0">
          <p className={cn("text-lg leading-tight font-bold tracking-tight tabular-nums", discounted && "text-accent")}>
            {formatCOP(getEffectivePrice(product))}
          </p>
          {discounted ? (
            <p className="text-xs text-muted-foreground tabular-nums line-through">{formatCOP(product.price)}</p>
          ) : (
            <p className={cn("truncate text-xs", soldOut ? "text-peligro" : "text-muted-foreground")}>
              {soldOut ? t("product.outOfStock") : t("product.available", { count: product.stock })}
            </p>
          )}
        </div>
        <Button onClick={handleAddToCart} disabled={product.stock === 0} loading={status === "adding"} className="ml-auto h-12 flex-1">
          {buttonLabel}
        </Button>
      </div>
    </Container>
  );
}
