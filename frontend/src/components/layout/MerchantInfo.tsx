"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { ContactInfo } from "@/lib/types";

/** Razón social y NIT del comerciante, visibles en toda la tienda (Ley 1480 de 2011, art. 50). */
export function MerchantInfo() {
  const t = useT();
  const [info, setInfo] = useState<ContactInfo | null>(null);

  useEffect(() => {
    apiFetch<ContactInfo>("/contact-info")
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info?.legalName) return null;
  return (
    <p className="text-xs">
      <span className="font-semibold text-foreground">{info.legalName}</span>
      {info.nit ? ` · ${t("footer.nit", { nit: info.nit })}` : null}
      {` · ${info.address}`}
    </p>
  );
}
