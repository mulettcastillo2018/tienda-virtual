import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Condiciones de compra, pagos, envíos y uso de la tienda.",
  alternates: { canonical: "/terminos" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
