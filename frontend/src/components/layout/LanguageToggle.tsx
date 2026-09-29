"use client";

import { useLocaleStore } from "@/store/locale.store";

export function LanguageToggle() {
  const locale = useLocaleStore((state) => state.locale);
  const toggleLocale = useLocaleStore((state) => state.toggleLocale);

  return (
    <button
      onClick={toggleLocale}
      title={locale === "es" ? "Switch to English" : "Cambiar a español"}
      aria-label={locale === "es" ? "Switch to English" : "Cambiar a español"}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-white"
    >
      {locale === "es" ? "EN" : "ES"}
    </button>
  );
}
