import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "es" | "en";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: "es",
      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set({ locale: get().locale === "es" ? "en" : "es" }),
    }),
    { name: "tienda-locale" }
  )
);
