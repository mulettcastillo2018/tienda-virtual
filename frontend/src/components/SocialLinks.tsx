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
    <div className="flex items-center gap-3">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.name}
          className="flex h-8 w-8 items-center justify-center transition-transform duration-200 hover:scale-125"
        >
          <Image src={link.iconUrl} alt={link.name} width={22} height={22} className="h-[22px] w-[22px] object-contain" />
        </a>
      ))}
    </div>
  );
}
