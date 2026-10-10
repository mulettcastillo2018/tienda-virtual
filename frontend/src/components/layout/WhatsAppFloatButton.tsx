"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { ContactInfo } from "@/lib/types";

export function WhatsAppFloatButton() {
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const t = useT();

  useEffect(() => {
    apiFetch<ContactInfo>("/contact-info")
      .then(setInfo)
      .catch(() => {
        /* si falla, simplemente no se muestra el botón */
      });
  }, []);

  if (!info) return null;

  const phone = info.whatsapp.replace(/\D/g, "");
  const message = encodeURIComponent(t("whatsapp.defaultMessage"));

  return (
    <a
      href={`https://wa.me/${phone}?text=${message}`}
      target="_blank"
      rel="noopener noreferrer"
      title={t("whatsapp.title")}
      aria-label={t("whatsapp.title")}
      data-flotante
      // En celular queda por encima de la barra inferior (4.5rem + zona segura).
      className="group fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.75rem)] z-40 flex size-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_12px_28px_-8px_rgb(37_211_102/0.6),0_2px_6px_rgb(0_0_0/0.12)] ring-1 ring-black/5 transition-all duration-300 ease-resorte hover:-translate-y-1 hover:scale-105 hover:shadow-[0_18px_34px_-8px_rgb(37_211_102/0.7),0_2px_6px_rgb(0_0_0/0.12)] active:scale-95 md:right-6 md:bottom-6 md:size-14 print:hidden"
    >
      <MessageCircle size={26} fill="white" className="transition-transform duration-300 ease-resorte group-hover:rotate-[-8deg] md:size-7" />
    </a>
  );
}
