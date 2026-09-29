"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { AuthUser } from "@/lib/types";

// Al volver de Google/Facebook el backend entrega un código de un solo uso
// (no el token, que quedaría en el historial del navegador); aquí se canjea.
function OAuthCallbackInner() {
  const code = useSearchParams().get("code");
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  // El código sirve una sola vez: que un doble montaje no lo gaste dos veces.
  const redeemed = useRef(false);

  useEffect(() => {
    if (!code) {
      setError(t("oauthCallback.invalidLink"));
      return;
    }
    if (redeemed.current) return;
    redeemed.current = true;
    // Quita el código de la barra de direcciones y del historial.
    window.history.replaceState(null, "", "/oauth-callback");
    apiFetch<{ token: string; user: AuthUser }>("/auth/oauth/exchange", { method: "POST", body: JSON.stringify({ code }) })
      .then(({ token, user }) => {
        setAuth(token, user, true);
        router.push("/");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("oauthCallback.failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="mx-auto max-w-sm px-4 py-16 text-center sm:px-6">
      <p className="text-muted-foreground">{error ?? t("oauthCallback.signingIn")}</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-sm px-4 py-16 text-center sm:px-6" />}>
      <OAuthCallbackInner />
    </Suspense>
  );
}
