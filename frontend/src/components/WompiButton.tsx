"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

interface WompiInitiateResponse {
  reference: string;
  amountInCents: number;
  currency: "COP";
  signature: string;
  publicKey: string;
}

export function WompiButton({ orderId }: { orderId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    let cancelled = false;

    async function mountWidget() {
      if (!token || !containerRef.current) return;

      try {
        const data = await apiFetch<WompiInitiateResponse>(`/payments/wompi/initiate/${orderId}`, {
          method: "POST",
          token,
        });
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = "";
        const script = document.createElement("script");
        script.src = "https://checkout.wompi.co/widget.js";
        script.setAttribute("data-render", "button");
        script.setAttribute("data-public-key", data.publicKey);
        script.setAttribute("data-currency", data.currency);
        script.setAttribute("data-amount-in-cents", String(data.amountInCents));
        script.setAttribute("data-reference", data.reference);
        script.setAttribute("data-signature:integrity", data.signature);
        script.setAttribute(
          "data-redirect-url",
          `${window.location.origin}/checkout/success?orderId=${orderId}`
        );
        containerRef.current.appendChild(script);
      } catch {
        if (!cancelled) setError("No se pudo iniciar el pago. Intenta de nuevo.");
      }
    }

    mountWidget();
    return () => {
      cancelled = true;
    };
  }, [orderId, token]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return <div ref={containerRef} />;
}
