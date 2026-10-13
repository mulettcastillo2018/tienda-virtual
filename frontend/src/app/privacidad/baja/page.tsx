"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { AuthCard } from "@/components/ui/AuthCard";
import { Button } from "@/components/ui/Button";

// Baja de las ofertas desde el enlace del correo. No pide iniciar sesión (la
// firma del enlace basta) y se confirma con un botón: así los filtros de
// correo que abren los enlaces no dan de baja a nadie sin querer.
function UnsubscribeForm() {
  const params = useSearchParams();
  const userId = params.get("u");
  const token = params.get("t");
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!userId || !token) {
    return (
      <p role="alert" className="rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
        {t("unsubscribe.invalid")}{" "}
        <Link href="/account#privacidad" className="underline underline-offset-4">
          {t("unsubscribe.goAccount")}
        </Link>
      </p>
    );
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <p role="status" className="rounded-2xl bg-exito/10 px-4 py-3 text-sm font-medium text-exito">
          {t("unsubscribe.done")}
        </p>
        <Link href="/" className="text-center text-sm font-semibold underline underline-offset-4">
          {t("unsubscribe.goStore")}
        </Link>
      </div>
    );
  }

  const confirm = async () => {
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/privacy/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`, { method: "POST" });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("unsubscribe.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("unsubscribe.explain")}</p>
      {error ? (
        <p role="alert" className="rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
          {error}
        </p>
      ) : null}
      <Button variant="dark" size="lg" block loading={loading} onClick={confirm}>
        {t("unsubscribe.confirm")}
      </Button>
    </div>
  );
}

export default function UnsubscribePage() {
  const t = useT();
  return (
    <AuthCard title={t("unsubscribe.title")}>
      <Suspense fallback={null}>
        <UnsubscribeForm />
      </Suspense>
    </AuthCard>
  );
}
