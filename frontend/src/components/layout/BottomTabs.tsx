"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Scale, ShoppingBag, Store, User } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { CartCount } from "./CartCount";

// Pestañas fijas abajo en el celular, al alcance del pulgar (como una app).
// Solo enlazan a las mismas rutas de siempre.
export function BottomTabs() {
  const user = useAuthStore((state) => state.user);
  const itemCount = useCartStore((state) => state.itemCount());
  const pathname = usePathname();
  const t = useT();

  const tabs = [
    { href: "/", label: t("nav.catalog"), Icon: Store, match: (p: string) => p === "/" || p.startsWith("/products") },
    { href: "/cart", label: t("nav.cart"), Icon: ShoppingBag, match: (p: string) => p.startsWith("/cart") || p.startsWith("/checkout"), count: itemCount },
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: t("nav.admin"), Icon: LayoutDashboard, match: (p: string) => p.startsWith("/admin") }] : []),
    ...(user?.role === "JURIDICO" ? [{ href: "/juridico", label: t("nav.juridico"), Icon: Scale, match: (p: string) => p.startsWith("/juridico") }] : []),
    {
      href: user ? "/account" : "/login",
      label: user ? t("nav.account") : t("nav.login"),
      Icon: User,
      match: (p: string) => p.startsWith("/account") || p.startsWith("/login"),
    },
  ];

  return (
    <nav
      aria-label={t("nav.catalog")}
      className="vidrio fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.15)] [--vidrio-opacidad:90%] md:hidden print:hidden"
    >
      <ul className="mx-auto flex max-w-md px-2">
        {tabs.map(({ href, label, Icon, match, count }) => {
          const active = match(pathname);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-semibold transition-colors duration-200",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                {/* Píldora detrás del icono: marca la sección actual y se encoge al tocar */}
                <span
                  className={cn(
                    "relative flex h-7 w-14 items-center justify-center rounded-full transition-all duration-300 ease-resorte active:scale-90",
                    active ? "bg-accent/12" : "bg-transparent",
                  )}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
                  {count ? <CartCount count={count} className="-top-1 right-1.5" /> : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
