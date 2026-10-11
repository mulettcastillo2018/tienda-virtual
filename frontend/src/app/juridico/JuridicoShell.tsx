"use client";

import { Scale, ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import { Container } from "@/components/ui/Container";

export function JuridicoShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const t = useT();

  if (!user || (user.role !== "JURIDICO" && user.role !== "ADMIN")) {
    return (
      <Container width="narrow" className="py-16 sm:py-24">
        <div className="flex flex-col items-center rounded-[2rem] border border-border bg-surface px-6 py-12 text-center shadow-suave">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-surface-2 text-foreground/80">
            <ShieldAlert size={28} aria-hidden />
          </span>
          <p className="mt-5 max-w-xs text-muted-foreground">{t("juridico.onlyLegalTeam")}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="max-w-5xl pt-6 pb-16 sm:pt-10">
      <div className="mb-6 flex items-center gap-3 px-1">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-foreground text-background shadow-elevada">
          <Scale size={20} aria-hidden />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">{t("juridico.title")}</h1>
      </div>
      {children}
    </Container>
  );
}
