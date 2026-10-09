import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge resuelve choques de clases (la última gana) y conoce los
// tokens propios de globals.css.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "background",
        "surface",
        "surface-2",
        "foreground",
        "muted",
        "muted-foreground",
        "border",
        "border-strong",
        "accent",
        "accent-foreground",
        "accent-2",
        "accent-3",
        "exito",
        "aviso",
        "peligro",
        "ring",
      ],
      shadow: ["suave", "elevada", "flotante", "acento"],
      ease: ["resorte", "salida"],
      animate: ["aparecer", "emerger", "salto", "brillo"],
    },
  },
});

/** Une clases utilitarias, ignora las que no aplican y resuelve choques. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return merge(classes.filter(Boolean).join(" "));
}
