import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "dark" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center font-semibold whitespace-nowrap select-none " +
  "transition-[translate,scale,box-shadow,background-color,border-color,color,filter] duration-200 ease-resorte " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  // La acción de compra: el único botón con el acento de la marca.
  primary: "bg-accent text-accent-foreground shadow-acento hover:-translate-y-px hover:brightness-110",
  // Acción principal sobria (tinta): para lo que no es comprar.
  dark: "bg-foreground text-background shadow-suave hover:-translate-y-px hover:shadow-elevada",
  secondary: "border border-border bg-surface text-foreground shadow-suave hover:border-border-strong hover:bg-surface-2",
  ghost: "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
  danger: "text-peligro ring-1 ring-peligro/30 ring-inset hover:bg-peligro/10",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 rounded-full px-4 text-xs [&_svg]:size-3.5",
  md: "h-11 gap-2 rounded-full px-5 text-sm [&_svg]:size-4",
  lg: "h-13 gap-2 rounded-full px-7 text-base [&_svg]:size-5",
};

interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

/** Clases de botón, también para enlaces (<Link className={buttonStyles()} />). */
export function buttonStyles({ variant = "primary", size = "md", block = false }: ButtonOptions = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full");
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & ButtonOptions & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonStyles({ variant, size, block }), className)}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
