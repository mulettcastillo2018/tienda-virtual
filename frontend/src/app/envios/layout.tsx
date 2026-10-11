import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de envíos",
  description: "Tiempos, costos y transportadoras de los envíos a toda Colombia.",
  alternates: { canonical: "/envios" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
