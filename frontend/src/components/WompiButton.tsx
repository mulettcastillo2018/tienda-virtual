"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";

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
  const t = useT();

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
        // El widget de Wompi espera que su <script> viva dentro de un <form>,
        // tal como lo documenta oficialmente — sin el form, el widget no se
        // inicializa correctamente.
        const form = document.createElement("form");
        const script = document.createElement("script");
        script.src = "https://checkout.wompi.co/widget.js";
        script.setAttribute("data-render", "button");
        script.setAttribute("data-public-key", data.publicKey);
        script.setAttribute("data-currency", data.currency);
        script.setAttribute("data-amount-in-cents", String(data.amountInCents));
        script.setAttribute("data-reference", data.reference);
        script.setAttribute("data-signature:integrity", data.signature);
        // Wompi rechaza (403) cualquier redirect-url que no sea HTTPS. En
        // desarrollo local (http://localhost) lo omitimos para poder probar
        // el widget; en producción (HTTPS real) sí se incluye.
        if (window.location.protocol === "https:") {
          script.setAttribute(
            "data-redirect-url",
            `${window.location.origin}/checkout/result?orderId=${orderId}`
          );
        }
        form.appendChild(script);
        containerRef.current.appendChild(form);
      } catch {
        if (!cancelled) setError(t("wompi.initError"));
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
