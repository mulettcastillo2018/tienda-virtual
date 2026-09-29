"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { ProductForm, type ProductFormValues } from "@/components/ProductForm";
import { useT } from "@/lib/i18n";
import type { Category, Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

export default function AdminProductsPage() {
  const token = useAuthStore((state) => state.token);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();

  async function loadData() {
    if (!token) return;
    const [productsData, categoriesData] = await Promise.all([
      apiFetch<{ items: Product[] }>("/products?pageSize=100", { token }),
      apiFetch<Category[]>("/categories"),
    ]);
    setProducts(productsData.items);
    setCategories(categoriesData);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreate(values: ProductFormValues) {
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/products", { method: "POST", token, body: JSON.stringify(values) });
      setCreating(false);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminProducts.createError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, values: ProductFormValues) {
    if (!token) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/products/${id}`, { method: "PUT", token, body: JSON.stringify(values) });
      setEditingId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminProducts.updateError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(product: Product) {
    if (!token) return;
    setError(null);
    try {
      if (product.isActive) {
        await apiFetch(`/products/${product.id}`, { method: "DELETE", token });
      } else {
        await apiFetch(`/products/${product.id}`, {
          method: "PUT",
          token,
          body: JSON.stringify({ isActive: true }),
        });
      }
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminProducts.toggleError"));
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-2">
        {products.map((product) =>
          editingId === product.id ? (
            <div key={product.id} className="rounded-xl border border-border p-4">
              <ProductForm
                categories={categories}
                submitLabel={t("adminProducts.saveChanges")}
                loading={saving}
                initialValues={{
                  name: product.name,
                  description: product.description,
                  price: product.price,
                  discountPercentage: product.discountPercentage,
                  brand: product.brand,
                  stock: product.stock,
                  categoryId: product.categoryId,
                  images: product.images,
                  weightInGrams: product.weightInGrams,
                  widthCm: product.widthCm,
                  heightCm: product.heightCm,
                  depthCm: product.depthCm,
                  sku: product.sku,
                  isActive: product.isActive,
                }}
                onSubmit={(values) => handleUpdate(product.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div
              key={product.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <div className="product-media relative aspect-square w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {product.images[0] ? (
                    <Image src={product.images[0]} alt={product.name} fill sizes="64px" className="object-cover" />
                  ) : null}
                </div>
                <div>
                  <p className="font-semibold">
                    {product.name} {!product.isActive ? <span className="text-muted-foreground">{t("adminProducts.inactive")}</span> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {product.sku} · {product.category?.name} · {t("adminProducts.stock", { count: product.stock })}
                  </p>
                  <p className="text-sm font-semibold">
                    {formatCOP(product.price)}
                    {product.discountPercentage ? (
                      <span className="badge-new ml-2 rounded-full px-2 py-0.5 text-xs font-bold">
                        -{product.discountPercentage}%
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingId(product.id)} className="text-sm font-semibold text-accent">
                  {t("adminProducts.edit")}
                </button>
                <button
                  onClick={() => handleToggleActive(product)}
                  className="text-sm font-semibold text-red-600"
                >
                  {product.isActive ? t("adminProducts.deactivate") : t("adminProducts.reactivate")}
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <div className="rounded-xl border border-border p-4">
          <h2 className="text-sm font-bold">{t("adminProducts.newProduct")}</h2>
          <div className="mt-3">
            <ProductForm
              categories={categories}
              submitLabel={t("adminProducts.createProduct")}
              loading={saving}
              onSubmit={handleCreate}
              onCancel={() => setCreating(false)}
            />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          disabled={categories.length === 0}
          className="btn-primary rounded-full px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("adminProducts.addProduct")}
        </button>
      )}
    </div>
  );
}
