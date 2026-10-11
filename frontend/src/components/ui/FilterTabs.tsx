import { cn } from "@/lib/cn";

const FILTER = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-200";
const FILTER_ON = "border-foreground bg-foreground text-background";
const FILTER_OFF = "border-border bg-surface text-muted-foreground hover:text-foreground";

/** Filtros en cápsulas (estado, rol…), con conteo opcional. En celular se deslizan. */
export function FilterTabs<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(FILTER, value === option.value ? FILTER_ON : FILTER_OFF)}
        >
          {option.label}
          {option.count !== undefined ? <span className="tabular-nums opacity-60">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
