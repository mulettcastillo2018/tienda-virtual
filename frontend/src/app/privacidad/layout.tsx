import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos",
  description: "Qué datos personales tratamos, para qué, tus derechos y cómo ejercerlos (Ley 1581 de 2012).",
  alternates: { canonical: "/privacidad" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
