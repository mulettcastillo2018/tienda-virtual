import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const WIDTHS = {
  narrow: "max-w-xl",
  medium: "max-w-3xl",
  wide: "max-w-7xl",
} as const;

/** Ancho y márgenes de página; el contenido respira más en pantallas grandes. */
export function Container({ width = "wide", className, children }: { width?: keyof typeof WIDTHS; className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", WIDTHS[width], className)}>{children}</div>;
}
