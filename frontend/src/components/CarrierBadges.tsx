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
      <h2 className="text-center text-sm font-bold text-foreground">{t("badges.shipsWith")}</h2>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-8">
        {carriers.map((carrier) => (
          <a
            key={carrier.id}
            href={carrier.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={carrier.name}
            className="transition-transform duration-200 hover:scale-110"
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
