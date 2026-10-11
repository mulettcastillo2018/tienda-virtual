import type { Metadata } from "next";

// Página personal: con título propio y fuera de los buscadores.
export const metadata: Metadata = { title: "Recuperar contraseña", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
