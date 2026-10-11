import type { Metadata } from "next";
import { JuridicoShell } from "./JuridicoShell";

// Panel interno: fuera de los buscadores.
export const metadata: Metadata = { title: "Área jurídica", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <JuridicoShell>{children}</JuridicoShell>;
}
