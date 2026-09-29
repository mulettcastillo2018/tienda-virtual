"use client";

import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";

export default function JuridicoLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const t = useT();

  if (!user || (user.role !== "JURIDICO" && user.role !== "ADMIN")) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center sm:px-6">
        <p className="text-muted-foreground">{t("juridico.onlyLegalTeam")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">{t("juridico.title")}</h1>
      <div className="mt-6">{children}</div>
    </div>
  );
}
