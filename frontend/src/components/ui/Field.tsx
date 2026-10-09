import { useId, type ComponentProps, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Borde, fondo y anillo de foco comunes a entradas, selects y áreas de texto. */
export const inputStyles =
  "w-full rounded-xl border border-border bg-surface px-4 text-sm text-foreground " +
  "shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] placeholder:text-muted-foreground/70 " +
  "transition-[border-color,box-shadow] duration-200 ease-salida hover:border-border-strong " +
  "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-peligro";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputStyles, "h-12", className)} {...props} />;
}

export function Select({ className, wrapperClassName, ...props }: ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select className={cn(inputStyles, "h-12 cursor-pointer appearance-none pr-10", className)} {...props} />
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputStyles, "min-h-28 py-3", className)} {...props} />;
}

/** Etiqueta + control + ayuda/error enlazados por id (accesibles). */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (control: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-nota`;
  const note = error ?? hint;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": note ? noteId : undefined })}
      {note ? (
        <p id={noteId} className={cn("text-xs", error ? "font-medium text-peligro" : "text-muted-foreground")}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
