"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
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
      <h1 className="text-2xl font-bold">Catálogo</h1>

      {loading ? <p className="mt-6 text-muted-foreground">Cargando productos…</p> : null}
      {error ? <p className="mt-6 text-red-600">{error}</p> : null}

      {!loading && !error && products.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Todavía no hay productos publicados.</p>
      ) : null}

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.id}`}
            className="rounded-2xl border border-border p-4 transition-shadow hover:shadow-md"
          >
            <div className="aspect-square rounded-xl bg-muted" />
            <h2 className="mt-3 font-semibold">{product.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{product.description}</p>
            <p className="mt-2 font-bold">{formatCOP(product.price)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
