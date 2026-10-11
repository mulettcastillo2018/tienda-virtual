import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Devoluciones y garantías",
  description: "Cómo devolver un producto, ejercer el derecho de retracto y hacer válida la garantía.",
  alternates: { canonical: "/devoluciones" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
