import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BottomTabs } from "@/components/layout/BottomTabs";
import { Toast } from "@/components/layout/Toast";
import { WhatsAppFloatButton } from "@/components/layout/WhatsAppFloatButton";
import { DecorativeBackground } from "@/components/layout/DecorativeBackground";
import { LocaleEffect } from "@/components/layout/LocaleEffect";

export const metadata: Metadata = {
  title: "Tienda Virtual",
  description: "Tienda virtual de productos físicos con pagos por Wompi.",
};

// Plus Jakarta Sans: sans-serif comercial de alta gama, muy legible en celular.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d11" },
  ],
};

// Se aplica el tema guardado antes de la primera pintura, para evitar el
// parpadeo de claro→oscuro al cargar la página.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem("tienda-theme");
    var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* En celular se deja espacio abajo para la barra de pestañas fija */}
      <body className="flex min-h-full flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0" suppressHydrationWarning>
        <DecorativeBackground />
        <LocaleEffect />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <BottomTabs />
        <Toast />
        <WhatsAppFloatButton />
      </body>
    </html>
  );
}
