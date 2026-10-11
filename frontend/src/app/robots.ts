import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/serverApi";

// Los buscadores recorren el catálogo y las páginas legales; no las de cuenta,
// carrito, pago ni los paneles.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/juridico",
        "/account",
        "/cart",
        "/checkout",
        "/pedido",
        "/login",
        "/forgot-password",
        "/reset-password",
        "/oauth-callback",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
