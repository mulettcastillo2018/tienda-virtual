"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

function isNew(createdAt: string) {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return days <= 7;
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ items: Product[] }>("/products")
      .then((data) => setProducts(data.items))
      .catch(() => setError("No se pudo conectar con la API. ¿Está corriendo el backend?"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Todo lo que buscas,{" "}
          <span className="brand-gradient-text">en un solo lugar</span>
        </h1>
        <p className="mt-3 text-muted-foreground">Productos seleccionados, envío a toda Colombia.</p>
      </div>

      {loading ? <p className="text-muted-foreground">Cargando productos…</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error && products.length === 0 ? (
        <p className="text-muted-foreground">Todavía no hay productos publicados.</p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="product-card group block bg-background">
            <div className="product-media relative aspect-square">
              {isNew(product.createdAt) ? (
                <span className="badge-new absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold">
                  Nuevo
                </span>
              ) : null}
            </div>
            <div className="p-4">
              <h2 className="font-bold">{product.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{product.description}</p>
              <p className="mt-2 text-lg font-extrabold">{formatCOP(product.price)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
