import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Toast } from "@/components/layout/Toast";
import { WhatsAppFloatButton } from "@/components/layout/WhatsAppFloatButton";
import { DecorativeBackground } from "@/components/layout/DecorativeBackground";
import { LocaleEffect } from "@/components/layout/LocaleEffect";

export const metadata: Metadata = {
  title: "Tienda Virtual",
  description: "Tienda virtual de productos físicos con pagos por Wompi.",
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
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <DecorativeBackground />
        <LocaleEffect />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toast />
        <WhatsAppFloatButton />
      </body>
    </html>
  );
}
