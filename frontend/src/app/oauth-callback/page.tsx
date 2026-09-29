"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import type { UserProfile } from "@/lib/types";

function OAuthCallbackInner() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    if (!token) {
      setError(t("oauthCallback.invalidLink"));
      return;
    }
    apiFetch<UserProfile>("/auth/me", { token })
      .then((profile) => {
        setAuth(token, { id: profile.id, email: profile.email, role: profile.role }, true);
        router.push("/");
      })
      .catch(() => setError(t("oauthCallback.failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
