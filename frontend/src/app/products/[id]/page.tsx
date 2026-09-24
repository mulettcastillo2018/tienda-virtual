"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import type { Product } from "@/lib/types";

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(amount);
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<"idle" | "adding" | "added">("idle");
  const token = useAuthStore((state) => state.token);
  const addItem = useCartStore((state) => state.addItem);

  useEffect(() => {
    apiFetch<Product>(`/products/${id}`).then(setProduct);
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

  if (!product) return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">Cargando…</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="product-media aspect-square rounded-2xl" />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{product.name}</h1>
          <p className="mt-3 text-3xl font-extrabold">{formatCOP(product.price)}</p>
          <p className="mt-4 text-muted-foreground">{product.description}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            {product.stock > 0 ? `${product.stock} disponibles` : "Sin stock"}
          </p>

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0 || status === "adding"}
            className="btn-primary mt-6 w-full rounded-full px-6 py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "added" ? "Agregado ✓" : status === "adding" ? "Agregando…" : "Añadir al carrito"}
          </button>
        </div>
      </div>
    </div>
  );
}
