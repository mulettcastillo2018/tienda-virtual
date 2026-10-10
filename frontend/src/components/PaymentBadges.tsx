"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { PaymentMethod } from "@/lib/types";

export function PaymentBadges() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const t = useT();

  useEffect(() => {
    apiFetch<PaymentMethod[]>("/payment-methods")
      .then(setMethods)
      .catch(() => {
        /* si falla, simplemente no se muestra la sección */
      });
  }, []);

  if (methods.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-semibold tracking-[0.14em] text-foreground uppercase">{t("badges.weAccept")}</h2>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {methods.map((method) => (
          <a
            key={method.id}
            href={method.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={method.name}
            className="flex h-11 items-center rounded-xl bg-white px-3.5 ring-1 ring-border transition-all duration-300 ease-salida hover:-translate-y-0.5 hover:shadow-suave"
          >
            <Image
              src={method.logoUrl}
              alt={method.name}
              width={64}
              height={24}
              className="h-6 w-auto object-contain"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
