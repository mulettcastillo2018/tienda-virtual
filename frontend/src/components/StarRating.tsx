import { Star } from "lucide-react";
import { cn } from "@/lib/cn";

/** Estrellas de 0 a 5 (admite medias: 4,6 llena cuatro y casi toda la quinta). */
export function StarRating({ value, size = 14, className, label }: { value: number; size?: number; className?: string; label?: string }) {
  return (
    <span role="img" aria-label={label ?? `${value} / 5`} className={cn("inline-flex items-center gap-0.5", className)}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, value - index));
        return (
          <span key={index} className="relative inline-flex" style={{ width: size, height: size }}>
            {/* La estrella vacía va rellena de gris: con solo el contorno, una estrella
                llena al 30 % parecía un "1" suelto. */}
            <Star size={size} aria-hidden className="absolute inset-0 fill-border-strong text-border-strong" strokeWidth={1.5} />
            {fill > 0 ? (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} aria-hidden className="fill-aviso text-aviso" strokeWidth={1.5} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
