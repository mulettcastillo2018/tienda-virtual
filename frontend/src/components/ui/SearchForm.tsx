"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { inputStyles } from "@/components/ui/Field";

/** Buscador de los listados del panel: busca al enviar, no con cada tecla. */
export function SearchForm({ placeholder, onSearch }: { placeholder: string; onSearch: (value: string) => void }) {
  const t = useT();
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={100}
          aria-label={placeholder}
          placeholder={placeholder}
          className={cn(inputStyles, "h-11 pl-10")}
        />
      </div>
      <Button type="submit" variant="secondary">
        {t("common.search")}
      </Button>
    </form>
  );
}
