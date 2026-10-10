"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/api";
import type { SocialLink } from "@/lib/types";

export function SocialLinks() {
  const [links, setLinks] = useState<SocialLink[]>([]);

  useEffect(() => {
    apiFetch<SocialLink[]>("/social-links")
      .then(setLinks)
      .catch(() => {
        /* si falla, simplemente no se muestra la sección */
      });
  }, []);

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.name}
          className="flex size-9 items-center justify-center rounded-full bg-surface-2 ring-1 ring-border transition-[translate,background-color,box-shadow] duration-300 ease-resorte ring-inset hover:-translate-y-0.5 hover:bg-surface hover:shadow-suave"
        >
          <Image src={link.iconUrl} alt={link.name} width={18} height={18} className="size-[18px] object-contain" />
        </a>
      ))}
    </div>
  );
}
