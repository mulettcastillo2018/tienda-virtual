import type { Metadata } from "next";

// Página personal (se abre con el enlace del correo): fuera de los buscadores.
export const metadata: Metadata = { title: "Tu pedido", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
