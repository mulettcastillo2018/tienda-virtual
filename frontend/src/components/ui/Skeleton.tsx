import { cn } from "@/lib/cn";

/** Marcador de carga (se detiene con "reducir movimiento"). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("esqueleto", className)} />;
}

/** Marcador con la forma de una tarjeta de producto. */
export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface p-2 shadow-suave">
      <Skeleton className="aspect-[4/5] rounded-[1.1rem]" />
      <div className="grid gap-2.5 p-3">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="mt-1 h-5 w-1/3" />
      </div>
    </div>
  );
}
