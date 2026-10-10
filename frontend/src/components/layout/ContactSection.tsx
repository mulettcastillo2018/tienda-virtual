"use client";

import { useEffect, useState } from "react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { ContactInfo } from "@/lib/types";

// Cada dato de contacto lleva su icono en un círculo suave.
const ICONO = "flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground";
const FILA = "flex items-center gap-3";
const ENLACE = "transition-colors duration-200 hover:text-foreground";

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
      <h2 className="text-xs font-semibold tracking-[0.14em] text-foreground uppercase">{t("contact.title")}</h2>
      <div className="mt-5 flex flex-col gap-3 text-sm text-muted-foreground">
        <span className={FILA}>
          <span className={ICONO}>
            <Phone size={15} />
          </span>
          {info.phone}
        </span>
        <a href={`https://wa.me/${info.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={`${FILA} ${ENLACE}`}>
          <span className={ICONO}>
            <MessageCircle size={15} />
          </span>
          {t("contact.whatsapp", { value: info.whatsapp })}
        </a>
        <a href={`mailto:${info.email}`} className={`${FILA} ${ENLACE}`}>
          <span className={ICONO}>
            <Mail size={15} />
          </span>
          {info.email}
        </a>
        <span className={FILA}>
          <span className={ICONO}>
            <MapPin size={15} />
          </span>
          {info.address}
        </span>
      </div>
    </div>
  );
}
