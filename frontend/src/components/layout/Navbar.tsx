"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, ShoppingBag, User } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { useToastStore } from "@/store/toast.store";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { CartCount } from "./CartCount";

// Enlace de la cápsula superior: la sección actual queda marcada con una pastilla.
function linkClass(active: boolean) {
  return cn(
    "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
    active ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground",
  );
}

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const fetchCart = useCartStore((state) => state.fetchCart);
  const mergeGuestCart = useCartStore((state) => state.mergeGuestCart);
  const itemCount = useCartStore((state) => state.itemCount());
  const showToast = useToastStore((state) => state.show);
  const router = useRouter();
  const t = useT();

  // Con sesión, lo que se agregó antes de ingresar pasa al carrito de la cuenta;
  // sin sesión, se muestra el carrito guardado en el navegador.
  useEffect(() => {
    (user ? mergeGuestCart() : fetchCart()).catch(() => {});
  }, [user, fetchCart, mergeGuestCart]);

  function handleLogout() {
    logout();
    useCartStore.setState({ cart: null });
    router.push("/");
    showToast(t("nav.logoutToast"));
  }

  const enCatalogo = pathname === "/" || pathname.startsWith("/products");
  const enCuenta = pathname.startsWith("/account") || pathname.startsWith("/login");
  const enCarrito = pathname.startsWith("/cart") || pathname.startsWith("/checkout");

  return (
    // La cabecera no captura clics fuera de la cápsula: el contenido se desplaza por debajo.
    <header className="pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4 print:hidden">
      <div className="vidrio pointer-events-auto mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 rounded-full pr-2 pl-5 shadow-suave">
        <Link href="/" className="brand-gradient-text whitespace-nowrap text-lg font-extrabold tracking-tight">
          Tienda Virtual
        </Link>

        <div className="flex items-center gap-1">
          {/* En escritorio: enlaces de texto. En celular los cubre la barra inferior. */}
          <nav className="hidden items-center gap-1 md:flex">
            <Link href="/" aria-current={enCatalogo ? "page" : undefined} className={linkClass(enCatalogo)}>
              {t("nav.catalog")}
            </Link>
            {user?.role === "ADMIN" ? (
              <Link href="/admin" aria-current={pathname.startsWith("/admin") ? "page" : undefined} className={linkClass(pathname.startsWith("/admin"))}>
                {t("nav.admin")}
              </Link>
            ) : null}
            {user?.role === "JURIDICO" ? (
              <Link href="/juridico" aria-current={pathname.startsWith("/juridico") ? "page" : undefined} className={linkClass(pathname.startsWith("/juridico"))}>
                {t("nav.juridico")}
              </Link>
            ) : null}
            <Link href={user ? "/account" : "/login"} aria-current={enCuenta ? "page" : undefined} className={linkClass(enCuenta)}>
              <User size={16} />
              <span className="max-w-[9rem] truncate">{user ? user.email.split("@")[0] : t("nav.login")}</span>
            </Link>
          </nav>

          {/* Salir también en celular: la página de cuenta no tiene su propio botón */}
          {user ? (
            <button
              onClick={handleLogout}
              title={t("nav.logout")}
              aria-label={t("nav.logout")}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut size={17} />
            </button>
          ) : null}
          <Link
            href="/cart"
            title={t("nav.cart")}
            aria-label={itemCount > 0 ? `${t("nav.cart")} (${itemCount})` : t("nav.cart")}
            aria-current={enCarrito ? "page" : undefined}
            className={cn(
              "relative hidden size-9 items-center justify-center rounded-full transition-colors duration-200 hover:bg-surface-2 hover:text-foreground md:flex",
              enCarrito ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground",
            )}
          >
            <ShoppingBag size={19} />
            <CartCount count={itemCount} className="-top-0.5 -right-0.5" />
          </Link>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
