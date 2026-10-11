"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  RotateCcw,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useCartStore } from "@/store/cart.store";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { SocialLinks } from "@/components/SocialLinks";
import { FlashDeals } from "@/components/FlashDeals";
import { StoreReviews } from "@/components/StoreReviews";
import { ProductCard } from "@/components/ProductCard";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Field, Input, inputStyles, Select } from "@/components/ui/Field";
import { ProductCardSkeleton } from "@/components/ui/Skeleton";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { Category, Product, ProductFilters } from "@/lib/types";

const PAGE_SIZE = 20;

// Categoría como en una app: icono grande y nombre corto; la elegida queda en tinta.
function CategoryTile({ active, onClick, Icon, label }: { active: boolean; onClick: () => void; Icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="group/cat flex w-[5.75rem] shrink-0 snap-start flex-col items-center gap-2 rounded-2xl px-1 pt-2 pb-1.5 text-center"
    >
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-[1.1rem] transition-[translate,scale,background-color,color,box-shadow] duration-300 ease-resorte group-hover/cat:-translate-y-0.5 group-active/cat:scale-95",
          active ? "bg-foreground text-background shadow-elevada" : "bg-surface-2 text-foreground/75 group-hover/cat:bg-border group-hover/cat:text-foreground",
        )}
      >
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <span
        className={cn(
          "line-clamp-2 text-[11px] leading-tight font-semibold transition-colors",
          active ? "text-foreground" : "text-muted-foreground group-hover/cat:text-foreground",
        )}
      >
        {label}
      </span>
    </button>
  );
}

export interface CatalogInitialData {
  categories: Category[] | null;
  filters: ProductFilters | null;
  products: { items: Product[]; total: number } | null;
}

/** Catálogo interactivo. Llega con la primera página ya cargada en el servidor
 *  (lo que leen Google y quien abre la tienda); los filtros se resuelven aquí. */
export function Catalog({ initial }: { initial: CatalogInitialData }) {
  const [products, setProducts] = useState<Product[]>(initial.products?.items ?? []);
  const [total, setTotal] = useState(initial.products?.total ?? 0);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>(initial.categories ?? []);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(!initial.products);
  // La primera página sin filtros ya vino del servidor: no se pide otra vez al abrir.
  const skipFirstLoad = useRef(Boolean(initial.products));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  const [filtersMeta, setFiltersMeta] = useState<ProductFilters | null>(initial.filters);
  const [showFilters, setShowFilters] = useState(false);
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [brandInput, setBrandInput] = useState("");
  const [appliedMinPrice, setAppliedMinPrice] = useState("");
  const [appliedMaxPrice, setAppliedMaxPrice] = useState("");
  const [appliedBrand, setAppliedBrand] = useState("");

  const addItem = useCartStore((state) => state.addItem);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const t = useT();

  function scrollCategories(direction: "left" | "right") {
    categoryScrollRef.current?.scrollBy({ left: direction === "left" ? -240 : 240, behavior: "smooth" });
  }

  async function handleAddToCart(event: React.MouseEvent, product: Product) {
    event.preventDefault();
    event.stopPropagation();


    setCartError(null);
    setAddingId(product.id);
    try {
      await addItem(product.id, 1);
      setAddedId(product.id);
      setTimeout(() => setAddedId((current) => (current === product.id ? null : current)), 1500);
    } catch (err) {
      setCartError(err instanceof ApiError ? err.message : t("home.addToCartError"));
    } finally {
      setAddingId(null);
    }
  }

  useEffect(() => {
    if (!initial.categories) {
      apiFetch<Category[]>("/categories")
        .then(setCategories)
        .catch(() => {
          /* la falla de categorías no debe bloquear el catálogo */
        });
    }
    if (!initial.filters) {
      apiFetch<ProductFilters>("/products/filters")
        .then(setFiltersMeta)
        .catch(() => {
          /* si falla, simplemente no se muestran los filtros de precio/marca */
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function buildParams(pageNum: number) {
    const params = new URLSearchParams({ page: String(pageNum), pageSize: String(PAGE_SIZE) });
    if (activeCategory) params.set("categoryId", activeCategory);
    if (search) params.set("search", search);
    if (appliedMinPrice) params.set("minPrice", appliedMinPrice);
    if (appliedMaxPrice) params.set("maxPrice", appliedMaxPrice);
    if (appliedBrand) params.set("brand", appliedBrand);
    return params;
  }

  useEffect(() => {
    if (skipFirstLoad.current) {
      skipFirstLoad.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    const params = buildParams(1);

    apiFetch<{ items: Product[]; total: number }>(`/products?${params}`)
      .then((data) => {
        setProducts(data.items);
        setTotal(data.total);
        setPage(1);
      })
      .catch(() => setError(t("home.apiError")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, search, appliedMinPrice, appliedMaxPrice, appliedBrand]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const nextPage = page + 1;
    const params = buildParams(nextPage);

    try {
      const data = await apiFetch<{ items: Product[]; total: number }>(`/products?${params}`);
      setProducts((prev) => [...prev, ...data.items]);
      setTotal(data.total);
      setPage(nextPage);
    } catch {
      setError(t("home.loadMoreError"));
    } finally {
      setLoadingMore(false);
    }
  }

  const hasActiveFilters = Boolean(appliedMinPrice || appliedMaxPrice || appliedBrand);

  function applyFilters() {
    setAppliedMinPrice(minPriceInput);
    setAppliedMaxPrice(maxPriceInput);
    setAppliedBrand(brandInput);
  }

  function clearFilters() {
    setMinPriceInput("");
    setMaxPriceInput("");
    setBrandInput("");
    setAppliedMinPrice("");
    setAppliedMaxPrice("");
    setAppliedBrand("");
  }

  const activeCategoryName = categories.find((category) => category.id === activeCategory)?.name;
  const resultsTitle = search ? t("home.resultsFor", { search }) : (activeCategoryName ?? t("home.allProducts"));
  const scrollButtonClass =
    "flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors duration-200 hover:border-border-strong hover:bg-surface-2 hover:text-foreground";

  return (
    <Container className="pt-4 pb-14 sm:pt-6">
      {/*
        Bento del inicio. En escritorio: titular y categorías a la izquierda;
        ofertas y reseñas a la derecha. En celular, las reseñas pasan al final
        para que los productos lleguen antes.
      */}
      <div className="bento-catalogo grid gap-3 sm:gap-4 lg:grid-cols-12">
        <section
          className={cn(
            "relative isolate flex flex-col justify-between gap-7 overflow-hidden rounded-[2rem] border border-border bg-surface p-5 shadow-suave sm:p-8 lg:col-span-8 lg:row-start-1 lg:p-10",
            categories.length === 0 && "lg:row-span-2",
          )}
        >
          <div aria-hidden className="absolute -top-32 -right-24 -z-10 size-96 rounded-full bg-accent/10 blur-3xl" />
          <div>
            <h1 className="max-w-2xl text-[2.1rem] leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
              {t("home.heroLine1")} <span className="brand-gradient-text">{t("home.heroHighlight")}</span>
            </h1>
            <p className="mt-3 text-muted-foreground sm:mt-4 sm:text-lg">{t("home.heroSubtitle")}</p>
          </div>

          <div className="grid gap-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("home.searchPlaceholder")}
                  aria-label={t("home.searchPlaceholder")}
                  className={cn(inputStyles, "h-13 rounded-full bg-background pl-11 text-[15px] shadow-suave")}
                />
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                aria-label={t("home.filters")}
                className={cn(
                  buttonStyles({ variant: "secondary" }),
                  "relative h-13 w-13 px-0 sm:w-auto sm:px-5",
                  (showFilters || hasActiveFilters) && "border-border-strong bg-surface-2",
                )}
              >
                <SlidersHorizontal />
                <span className="hidden sm:inline">{t("home.filters")}</span>
                {hasActiveFilters ? (
                  <span aria-hidden className="absolute top-3 right-3 size-2 rounded-full bg-accent ring-2 ring-surface sm:static sm:ring-0" />
                ) : null}
              </button>
            </div>

            {showFilters ? (
              <div className="animate-aparecer grid gap-3 rounded-2xl border border-border bg-background/70 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                <Field label={t("home.minPrice")}>
                  {(control) => (
                    <Input
                      {...control}
                      type="number"
                      min={0}
                      value={minPriceInput}
                      onChange={(e) => setMinPriceInput(e.target.value)}
                      placeholder={filtersMeta ? String(filtersMeta.minPrice) : "0"}
                      className="h-11"
                    />
                  )}
                </Field>
                <Field label={t("home.maxPrice")}>
                  {(control) => (
                    <Input
                      {...control}
                      type="number"
                      min={0}
                      value={maxPriceInput}
                      onChange={(e) => setMaxPriceInput(e.target.value)}
                      placeholder={filtersMeta ? String(filtersMeta.maxPrice) : "0"}
                      className="h-11"
                    />
                  )}
                </Field>
                {filtersMeta && filtersMeta.brands.length > 0 ? (
                  <Field label={t("home.brand")}>
                    {(control) => (
                      <Select {...control} value={brandInput} onChange={(e) => setBrandInput(e.target.value)} className="h-11">
                        <option value="">{t("home.allBrands")}</option>
                        {filtersMeta.brands.map((brand) => (
                          <option key={brand} value={brand}>
                            {brand}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ) : null}
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1">
                  <Button variant="dark" onClick={applyFilters}>
                    {t("home.apply")}
                  </Button>
                  {hasActiveFilters ? (
                    <Button variant="ghost" onClick={clearFilters}>
                      {t("home.clearFilters")}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* En celular: una sola fila que se desliza; desde sm se acomoda en líneas */}
            <div className="no-scrollbar -mx-5 flex items-center gap-4 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:justify-between sm:gap-y-3 sm:overflow-visible sm:px-0">
              <ul className="flex shrink-0 gap-x-4 gap-y-2 text-xs font-medium whitespace-nowrap text-muted-foreground sm:flex-wrap">
                <li className="flex items-center gap-1.5">
                  <ShieldCheck size={15} aria-hidden className="text-exito" />
                  {t("home.trustPayment")}
                </li>
                <li>
                  <Link href="/envios" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                    <Truck size={15} aria-hidden />
                    {t("home.trustShipping")}
                  </Link>
                </li>
                <li>
                  <Link href="/devoluciones" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                    <RotateCcw size={15} aria-hidden />
                    {t("home.trustReturns")}
                  </Link>
                </li>
              </ul>
              <SocialLinks />
            </div>
          </div>
        </section>

        {categories.length > 0 ? (
          <section
            aria-labelledby="titulo-categorias"
            data-celda="categorias"
            className="min-w-0 rounded-[2rem] border border-border bg-surface p-3 shadow-suave sm:p-4 lg:col-span-8 lg:row-start-2 lg:flex lg:flex-col"
          >
            <div className="mb-1 flex items-center justify-between gap-3 px-2 pt-1">
              <h2 id="titulo-categorias" className="text-sm font-bold tracking-tight">
                {t("home.shopByCategory")}
              </h2>
              <div className="hidden gap-1.5 sm:flex">
                <button onClick={() => scrollCategories("left")} aria-label={t("home.scrollLeft")} className={scrollButtonClass}>
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => scrollCategories("right")} aria-label={t("home.scrollRight")} className={scrollButtonClass}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            {/* Si la fila del bento es más alta (p. ej. por las reseñas), los iconos quedan centrados */}
            <div ref={categoryScrollRef} className="no-scrollbar flex snap-x gap-1 overflow-x-auto scroll-px-1 px-1 lg:my-auto">
              <CategoryTile active={activeCategory === null} onClick={() => setActiveCategory(null)} Icon={LayoutGrid} label={t("home.all")} />
              {categories.map((category) => (
                <CategoryTile
                  key={category.id}
                  active={activeCategory === category.id}
                  onClick={() => setActiveCategory(category.id)}
                  Icon={getCategoryIcon(category.icon, category.slug)}
                  label={category.name}
                />
              ))}
            </div>
          </section>
        ) : null}

        <FlashDeals className="lg:col-span-4 lg:col-start-9 lg:row-start-1" />
        <StoreReviews className="order-last mt-5 lg:order-none lg:col-span-4 lg:col-start-9 lg:row-start-2 lg:mt-0" />

        <section aria-labelledby="titulo-resultados" className="mt-5 min-w-0 sm:mt-8 lg:col-span-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-1 sm:mb-5">
            <div className="min-w-0">
              <h2 id="titulo-resultados" className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {resultsTitle}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
                {loading ? t("home.loading") : total === 1 ? t("home.resultsCountOne") : t("home.resultsCount", { count: total })}
              </p>
            </div>
            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                {t("home.clearFilters")}
              </button>
            ) : null}
          </div>

          {error ? <p role="alert" className="mb-4 rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">{error}</p> : null}
          {cartError ? (
            <p role="alert" className="mb-4 rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
              {cartError}
            </p>
          ) : null}

          {!loading && !error && products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-16 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
                <SearchX size={24} aria-hidden />
              </span>
              <p className="max-w-sm text-sm text-muted-foreground">
                {search ? t("home.noResultsSearch", { search }) : t("home.noResults")}
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {loading
              ? Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)
              : products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    addingId={addingId}
                    addedId={addedId}
                    onAddToCart={handleAddToCart}
                  />
                ))}
            {loadingMore ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={`mas-${i}`} />) : null}
          </div>

          {!loading && products.length < total ? (
            <div className="mt-10 flex justify-center">
              <Button variant="secondary" onClick={handleLoadMore} loading={loadingMore}>
                {loadingMore ? t("home.loadingShort") : t("home.loadMore")}
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </Container>
  );
}
