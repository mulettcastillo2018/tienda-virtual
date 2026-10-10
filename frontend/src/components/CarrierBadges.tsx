"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Carrier } from "@/lib/types";

export function CarrierBadges() {
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const t = useT();

  useEffect(() => {
    apiFetch<Carrier[]>("/carriers")
      .then(setCarriers)
      .catch(() => {
        /* si falla, simplemente no se muestra la sección */
      });
  }, []);

  if (carriers.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-semibold tracking-[0.14em] text-foreground uppercase">{t("badges.shipsWith")}</h2>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {carriers.map((carrier) => (
          <a
            key={carrier.id}
            href={carrier.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={carrier.name}
            className="flex h-11 items-center rounded-xl bg-white px-3.5 ring-1 ring-border transition-all duration-300 ease-salida hover:-translate-y-0.5 hover:shadow-suave"
          >
            <Image
              src={carrier.logoUrl}
              alt={carrier.name}
              width={100}
              height={24}
              className="h-6 w-auto object-contain"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
