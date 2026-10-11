"use client";

import Link from "next/link";
import { CarrierBadges } from "@/components/CarrierBadges";
import { PaymentBadges } from "@/components/PaymentBadges";
import { Container } from "@/components/ui/Container";
import { ContactSection } from "./ContactSection";
import { MerchantInfo } from "./MerchantInfo";
import { useT } from "@/lib/i18n";

const ENLACE = "transition-colors duration-200 hover:text-foreground";

export function Footer() {
  const t = useT();

  return (
    <footer className="mt-20 border-t border-border bg-surface/60 text-sm text-muted-foreground">
      <Container className="py-14 sm:py-16">
        {/* Contacto, transportadoras y medios de pago: tres bloques con aire entre sí */}
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between lg:gap-16">
          <ContactSection />
          <CarrierBadges />
          <PaymentBadges />
        </div>

        <div className="mt-14 flex flex-col gap-5 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1 sm:order-1">
            <MerchantInfo />
            <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:order-2">
            <Link href="/terminos" className={ENLACE}>
              {t("footer.terms")}
            </Link>
            <Link href="/envios" className={ENLACE}>
              {t("footer.shipping")}
            </Link>
            <Link href="/devoluciones" className={ENLACE}>
              {t("footer.returns")}
            </Link>
            <Link href="/privacidad" className={ENLACE}>
              {t("footer.privacy")}
            </Link>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
