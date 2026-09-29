"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LayoutGrid, Search, SlidersHorizontal } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { SocialLinks } from "@/components/SocialLinks";
import { FlashDeals } from "@/components/FlashDeals";
import { StoreReviews } from "@/components/StoreReviews";
import { ProductCard } from "@/components/ProductCard";
import { useT } from "@/lib/i18n";
import type { Category, Product, ProductFilters } from "@/lib/types";

const PAGE_SIZE = 20;

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  const [filtersMeta, setFiltersMeta] = useState<ProductFilters | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [brandInput, setBrandInput] = useState("");
  const [appliedMinPrice, setAppliedMinPrice] = useState("");
  const [appliedMaxPrice, setAppliedMaxPrice] = useState("");
  const [appliedBrand, setAppliedBrand] = useState("");

  const token = useAuthStore((state) => state.token);
  const addItem = useCartStore((state) => state.addItem);
  const router = useRouter();
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const t = useT();

  function scrollCategories(direction: "left" | "right") {
    categoryScrollRef.current?.scrollBy({ left: direction === "left" ? -240 : 240, behavior: "smooth" });
  }

  async function handleAddToCart(event: React.MouseEvent, product: Product) {
    event.preventDefault();
    event.stopPropagation();

    if (!token) {
      router.push("/login");
      return;
    }

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
    apiFetch<Category[]>("/categories")
      .then(setCategories)
      .catch(() => {
        /* la falla de categorías no debe bloquear el catálogo */
      });
    apiFetch<ProductFilters>("/products/filters")
      .then(setFiltersMeta)
      .catch(() => {
        /* si falla, simplemente no se muestran los filtros de precio/marca */
      });
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          {t("home.heroLine1")} <span className="brand-gradient-text">{t("home.heroHighlight")}</span>
        </h1>
        <p className="mt-3 text-muted-foreground">{t("home.heroSubtitle")}</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("home.searchPlaceholder")}
            className="w-full rounded-full border border-border py-2 pl-9 pr-4 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
            showFilters || hasActiveFilters ? "border-accent text-accent" : "border-border text-muted-foreground"
          }`}
        >
          <SlidersHorizontal size={14} />
          {t("home.filters")}
          {hasActiveFilters ? <span className="ml-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
        </button>
        <div className="ml-auto">
          <SocialLinks />
        </div>
      </div>

      {showFilters ? (
        <div className="mb-8 flex flex-wrap items-end gap-4 rounded-xl border border-border p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("home.minPrice")}</label>
            <input
              type="number"
              min={0}
              value={minPriceInput}
              onChange={(e) => setMinPriceInput(e.target.value)}
              placeholder={filtersMeta ? String(filtersMeta.minPrice) : "0"}
              className="w-32 rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("home.maxPrice")}</label>
            <input
              type="number"
              min={0}
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
              placeholder={filtersMeta ? String(filtersMeta.maxPrice) : "0"}
              className="w-32 rounded-lg border border-border px-3 py-2 text-sm"
            />
          </div>
          {filtersMeta && filtersMeta.brands.length > 0 ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">{t("home.brand")}</label>
              <select
                value={brandInput}
                onChange={(e) => setBrandInput(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                <option value="">{t("home.allBrands")}</option>
                {filtersMeta.brands.map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button onClick={applyFilters} className="btn-primary rounded-full px-5 py-2 text-sm">
            {t("home.apply")}
          </button>
          {hasActiveFilters ? (
            <button onClick={clearFilters} className="text-sm font-semibold text-muted-foreground underline">
              {t("home.clearFilters")}
            </button>
          ) : null}
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="relative mb-8">
          <button
            onClick={() => scrollCategories("left")}
            aria-label={t("home.scrollLeft")}
            className="absolute -left-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:border-accent hover:text-foreground"
          >
            <ChevronLeft size={16} />
          </button>

          <div
            ref={categoryScrollRef}
            className="no-scrollbar grid auto-cols-max grid-flow-col grid-rows-2 gap-2 overflow-x-auto px-1 pb-2"
          >
            <button
              onClick={() => setActiveCategory(null)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                activeCategory === null ? "btn-primary" : "bg-muted text-muted-foreground hover:bg-accent hover:text-white"
              }`}
            >
              <LayoutGrid size={14} />
              {t("home.all")}
            </button>
            {categories.map((category) => {
              const CategoryIcon = getCategoryIcon(category.icon, category.slug);
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    activeCategory === category.id
                      ? "btn-primary"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-white"
                  }`}
                >
                  <CategoryIcon size={14} />
                  {category.name}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => scrollCategories("right")}
            aria-label={t("home.scrollRight")}
            className="absolute -right-3 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:border-accent hover:text-foreground"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}

      {loading ? <p className="text-muted-foreground">{t("home.loading")}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}
      {cartError ? <p className="text-red-600">{cartError}</p> : null}

      {!loading && !error && products.length === 0 ? (
        <p className="text-muted-foreground">
          {search ? t("home.noResultsSearch", { search }) : t("home.noResults")}
        </p>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                addingId={addingId}
                addedId={addedId}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>

          {!loading && products.length < total ? (
            <div className="mt-8 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? t("home.loadingShort") : t("home.loadMore")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="order-first flex w-full flex-col gap-6 lg:order-none lg:w-72 lg:shrink-0">
          <FlashDeals />
          <StoreReviews />
        </div>
      </div>
    </div>
  );
}
