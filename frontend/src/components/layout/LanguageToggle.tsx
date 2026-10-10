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
      className="flex size-9 items-center justify-center rounded-full text-xs font-bold tracking-wide text-muted-foreground transition-colors duration-200 hover:bg-surface-2 hover:text-foreground active:scale-95"
    >
      {locale === "es" ? "EN" : "ES"}
    </button>
  );
}
