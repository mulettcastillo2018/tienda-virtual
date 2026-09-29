"use client";

import Link from "next/link";
import { CarrierBadges } from "@/components/CarrierBadges";
import { PaymentBadges } from "@/components/PaymentBadges";
import { ContactSection } from "./ContactSection";
import { useT } from "@/lib/i18n";

export function Footer() {
  const t = useT();

  return (
    <footer className="text-center text-sm text-muted-foreground">
      <div className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-16">
            <CarrierBadges />
            <PaymentBadges />
          </div>
          <ContactSection />
        </div>
      </div>
      <div className="py-6">
        <nav className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <Link href="/terminos" className="hover:text-foreground">
            {t("footer.terms")}
          </Link>
          <Link href="/envios" className="hover:text-foreground">
            {t("footer.shipping")}
          </Link>
          <Link href="/devoluciones" className="hover:text-foreground">
            {t("footer.returns")}
          </Link>
        </nav>
        {t("footer.rights", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
