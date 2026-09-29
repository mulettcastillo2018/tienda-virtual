"use client";

import { useEffect, useState } from "react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { ContactInfo } from "@/lib/types";

export function ContactSection() {
  const [info, setInfo] = useState<ContactInfo | null>(null);
  const t = useT();

  useEffect(() => {
    apiFetch<ContactInfo>("/contact-info")
      .then(setInfo)
      .catch(() => {
        /* si falla, simplemente no se muestra la sección */
      });
  }, []);

  if (!info) return null;

  return (
    <div>
      <h2 className="text-center text-sm font-bold text-foreground">{t("contact.title")}</h2>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Phone size={16} /> {info.phone}
        </span>
        <a href={`https://wa.me/${info.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground">
          <MessageCircle size={16} /> {t("contact.whatsapp", { value: info.whatsapp })}
        </a>
        <a href={`mailto:${info.email}`} className="flex items-center gap-2 hover:text-foreground">
          <Mail size={16} /> {info.email}
        </a>
        <span className="flex items-center gap-2">
          <MapPin size={16} /> {info.address}
        </span>
      </div>
    </div>
  );
}
