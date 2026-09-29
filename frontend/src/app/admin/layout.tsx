"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();
  const t = useT();

  const TABS = [
    { href: "/admin", label: t("adminNav.orders") },
    { href: "/admin/products", label: t("adminNav.products") },
    { href: "/admin/categories", label: t("adminNav.categories") },
    { href: "/admin/discounts", label: t("adminNav.discounts") },
    { href: "/admin/carriers", label: t("adminNav.carriers") },
    { href: "/admin/payment-methods", label: t("adminNav.paymentMethods") },
    { href: "/admin/social-links", label: t("adminNav.socialLinks") },
    { href: "/admin/pqrs", label: t("adminNav.pqrs") },
    { href: "/admin/contact", label: t("adminNav.contact") },
    { href: "/admin/users", label: t("adminNav.users") },
  ];

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">{t("adminNav.onlyAdmins")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">{t("adminNav.title")}</h1>

      <nav className="mt-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${
              pathname === tab.href ? "btn-primary" : "bg-muted text-muted-foreground hover:bg-accent hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
