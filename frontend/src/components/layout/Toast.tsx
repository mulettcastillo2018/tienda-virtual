"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { useToastStore } from "@/store/toast.store";

export function Toast() {
  const message = useToastStore((state) => state.message);
  const clear = useToastStore((state) => state.clear);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, 3000);
    return () => clearTimeout(timer);
  }, [message, clear]);

  if (!message) return null;

  // En celular flota por encima de la barra inferior (4.5rem + zona segura).
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.75rem)] z-50 flex justify-center px-4 md:bottom-6">
      <div
        role="status"
        aria-live="polite"
        className="flex max-w-full animate-emerger items-center gap-2.5 rounded-full bg-foreground py-2 pr-4 pl-2.5 text-sm leading-snug font-medium text-background shadow-flotante ring-1 ring-background/10"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-exito text-background">
          <Check size={12} strokeWidth={3.5} />
        </span>
        {message}
      </div>
    </div>
  );
}
