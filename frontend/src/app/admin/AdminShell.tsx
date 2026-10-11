"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Percent,
  Phone,
  RotateCcw,
  Share2,
  ShieldAlert,
  Tags,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/Container";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();
  const t = useT();

  const TABS = [
    { href: "/admin", label: t("adminNav.orders"), Icon: Package },
    { href: "/admin/sales", label: t("adminNav.sales"), Icon: TrendingUp },
    { href: "/admin/returns", label: t("adminNav.returns"), Icon: RotateCcw },
    { href: "/admin/billing", label: t("adminNav.billing"), Icon: FileText },
    { href: "/admin/products", label: t("adminNav.products"), Icon: Boxes },
    { href: "/admin/categories", label: t("adminNav.categories"), Icon: Tags },
    { href: "/admin/discounts", label: t("adminNav.discounts"), Icon: Percent },
    { href: "/admin/carriers", label: t("adminNav.carriers"), Icon: Truck },
    { href: "/admin/payment-methods", label: t("adminNav.paymentMethods"), Icon: CreditCard },
    { href: "/admin/social-links", label: t("adminNav.socialLinks"), Icon: Share2 },
    { href: "/admin/pqrs", label: t("adminNav.pqrs"), Icon: MessageSquareText },
    { href: "/admin/contact", label: t("adminNav.contact"), Icon: Phone },
    { href: "/admin/users", label: t("adminNav.users"), Icon: Users },
  ];

  if (!user || user.role !== "ADMIN") {
    return (
      <Container width="narrow" className="py-16 sm:py-24">
        <div className="flex flex-col items-center rounded-[2rem] border border-border bg-surface px-6 py-12 text-center shadow-suave">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-foreground/80">
            <ShieldAlert size={28} aria-hidden />
          </span>
          <p className="mt-5 max-w-xs text-muted-foreground">{t("adminNav.onlyAdmins")}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="pt-6 pb-16 sm:pt-10">
      <div className="mb-6 flex items-center gap-3 px-1">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-elevada">
          <LayoutDashboard size={20} aria-hidden />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("adminNav.title")}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* Secciones: fila deslizable en celular, columna fija en escritorio */}
        <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:rounded-[1.5rem] lg:border lg:border-border lg:bg-surface lg:p-2 lg:shadow-suave">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 lg:rounded-xl lg:px-3",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground lg:border-transparent lg:bg-transparent lg:hover:bg-surface-2",
                )}
              >
                <Icon size={16} aria-hidden className="shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
