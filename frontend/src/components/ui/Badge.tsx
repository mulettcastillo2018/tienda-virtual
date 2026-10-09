import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "dark" | "accent" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted-foreground ring-border",
  dark: "bg-foreground text-background ring-foreground",
  accent: "bg-accent/10 text-accent ring-accent/20",
  success: "bg-exito/10 text-exito ring-exito/20",
  warning: "bg-aviso/10 text-aviso ring-aviso/20",
  danger: "bg-peligro text-white ring-peligro dark:text-background",
};

export function badgeStyles(tone: BadgeTone = "neutral") {
  return cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] leading-none font-semibold ring-1 ring-inset [&_svg]:size-3", TONES[tone]);
}

/** Etiqueta corta (Nuevo, -20%, Agotado...). */
export function Badge({ tone, className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return <span className={cn(badgeStyles(tone), className)} {...props} />;
}
