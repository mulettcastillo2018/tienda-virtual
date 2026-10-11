import type { Metadata } from "next";
import { AdminShell } from "./AdminShell";

// Panel interno: fuera de los buscadores.
export const metadata: Metadata = { title: "Administración", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
