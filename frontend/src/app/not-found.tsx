"use client";

import Link from "next/link";
import { SearchX } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { buttonStyles } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

// Página para direcciones que no existen, con el diseño y el idioma de la tienda.
export default function NotFound() {
  const t = useT();
  return (
    <Container width="narrow" className="py-16 sm:py-24">
      <div className="flex flex-col items-center rounded-[2rem] border border-border bg-surface px-6 py-12 text-center shadow-suave">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
          <SearchX size={28} aria-hidden />
        </span>
        <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">404</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{t("notFound.title")}</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">{t("notFound.body")}</p>
        <Link href="/" className={cn(buttonStyles({ variant: "dark" }), "mt-6")}>
          {t("notFound.back")}
        </Link>
      </div>
    </Container>
  );
}
