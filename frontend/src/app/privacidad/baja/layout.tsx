import type { Metadata } from "next";

// Llega desde un correo personal: con título propio y fuera de los buscadores.
export const metadata: Metadata = { title: "Dejar de recibir ofertas", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
