import type { Metadata } from "next";
import { Catalog } from "@/components/Catalog";
import { jsonLd, serverGet, SITE_URL, STORE_NAME } from "@/lib/serverApi";
import type { Category, Product, ProductFilters } from "@/lib/types";

// El inicio se arma en el servidor y se guarda un minuto: los productos quedan
// en el HTML (Google, vista previa de enlaces) y la página aparece sin esperar.
export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [categories, filters, products] = await Promise.all([
    serverGet<Category[]>("/categories"),
    serverGet<ProductFilters>("/products/filters"),
    serverGet<{ items: Product[]; total: number }>("/products?page=1&pageSize=20"),
  ]);

  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", name: STORE_NAME, url: SITE_URL, inLanguage: "es-CO" },
      { "@type": "OnlineStore", name: STORE_NAME, url: SITE_URL, areaServed: "CO", currenciesAccepted: "COP" },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />
      <Catalog
        initial={{
          categories: categories.ok ? categories.data : null,
          filters: filters.ok ? filters.data : null,
          products: products.ok ? products.data : null,
        }}
      />
    </>
  );
}
