import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/ProductDetail";
import { getEffectivePrice } from "@/lib/pricing";
import { jsonLd, serverGet, SITE_URL, STORE_NAME, summarize } from "@/lib/serverApi";
import type { Product } from "@/lib/types";

// Cada ficha se arma en el servidor la primera vez que alguien la abre y se
// guarda un minuto: Google y los enlaces compartidos ven el producto completo.
export const revalidate = 60;

export async function generateStaticParams() {
  return [];
}

async function loadProduct(id: string) {
  const result = await serverGet<Product>(`/products/${encodeURIComponent(id)}`);
  // Inexistente o desactivado: 404 de verdad (no una página vacía que Google indexe).
  if (!result.ok && result.status === 404) notFound();
  return result.ok ? result.data : null;
}

export async function generateMetadata({ params }: PageProps<"/products/[id]">): Promise<Metadata> {
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product) return { title: STORE_NAME };
  const description = summarize(product.description);
  const path = `/products/${product.id}`;
  return {
    title: product.name,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: product.name,
      description,
      images: product.images.slice(0, 1).map((url) => ({ url, alt: product.name })),
    },
    twitter: { card: "summary_large_image", title: product.name, description, images: product.images.slice(0, 1) },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const product = await loadProduct(id);

  // Datos estructurados (schema.org/Product): precio, existencias y fotos para
  // los resultados enriquecidos de Google.
  const structured = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: summarize(product.description, 5000),
        image: product.images,
        sku: product.sku,
        ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
        ...(product.category ? { category: product.category.name } : {}),
        ...(product.weightInGrams > 0 ? { weight: { "@type": "QuantitativeValue", value: product.weightInGrams, unitCode: "GRM" } } : {}),
        offers: {
          "@type": "Offer",
          url: `${SITE_URL}/products/${product.id}`,
          priceCurrency: "COP",
          price: getEffectivePrice(product),
          availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          seller: { "@type": "Organization", name: STORE_NAME },
        },
      }
    : null;

  return (
    <>
      {structured ? <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} /> : null}
      <ProductDetail key={id} id={id} initialProduct={product} />
    </>
  );
}
