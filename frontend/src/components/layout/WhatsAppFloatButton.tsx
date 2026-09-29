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
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform duration-200 hover:scale-110"
      style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <MessageCircle size={28} fill="white" />
    </a>
  );
}
