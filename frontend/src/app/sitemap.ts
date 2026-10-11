import type { MetadataRoute } from "next";
import { serverGet, SITE_URL } from "@/lib/serverApi";
import type { Product } from "@/lib/types";

// Se arma en cada pedido con los productos guardados en caché una hora: si la
// API no responde (el plan gratis se duerme), ese sitemap incompleto no queda
// guardado, y el build no depende de que la API esté despierta.
export const revalidate = 0;

const MAX_PAGES = 50; // hasta 5.000 productos; más allá conviene partir el sitemap

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products: Product[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await serverGet<{ items: Product[]; total: number }>(`/products?page=${page}&pageSize=100`, 3600);
    if (!result.ok) break;
    products.push(...result.data.items);
    if (products.length >= result.data.total || result.data.items.length === 0) break;
  }

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...products.map((product) => ({
      url: `${SITE_URL}/products/${product.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: product.images.slice(0, 1),
    })),
    ...["/envios", "/devoluciones", "/terminos"].map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
