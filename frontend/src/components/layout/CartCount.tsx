"use client";

import { cn } from "@/lib/cn";

/**
 * Burbuja con la cantidad de productos del carrito. Al cambiar la cantidad,
 * la clave del elemento cambia y la animación de salto se repite.
 */
export function CartCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      key={count}
      aria-hidden
      className={cn(
        "absolute -top-1.5 -right-2 flex h-[18px] min-w-[18px] animate-salto items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground tabular-nums ring-2 ring-background",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
