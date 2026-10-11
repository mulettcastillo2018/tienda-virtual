"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { AuthCard } from "@/components/ui/AuthCard";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import type { AuthUser } from "@/lib/types";

const REMEMBERED_EMAIL_KEY = "tienda-remembered-email";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface OAuthStatus {
  google: boolean;
  facebook: boolean;
}

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(true);
  const [rememberedEmail, setRememberedEmail] = useState("");
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const setAuth = useAuthStore((state) => state.setAuth);
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    const saved = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (saved) {
      setRememberedEmail(saved);
    } else {
      setRemember(false);
    }

    // Motivo de un inicio social fallido o de una sesión que el servidor cerró.
    const params = new URLSearchParams(window.location.search);
    const notice = params.get("oauthError") ?? params.get("aviso");
    if (notice) {
      setError(notice);
      router.replace("/login");
    }

    apiFetch<OAuthStatus>("/auth/oauth-status")
      .then(setOauthStatus)
      .catch(() => setOauthStatus({ google: false, facebook: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = event.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const phone =
      mode === "register" ? (form.elements.namedItem("phone") as HTMLInputElement).value : undefined;
    const checked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false;
    const consent = mode === "register" ? { acceptPrivacy: checked("acceptPrivacy"), marketing: checked("marketing") } : {};

    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>(
        mode === "login" ? "/auth/login" : "/auth/register",
        { method: "POST", body: JSON.stringify({ email, password, ...(phone ? { phone } : {}), ...consent }) }
      );

      if (mode === "login") {
        if (remember) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      }

      setAuth(data.token, data.user, remember);
      // ?next=/checkout: vuelve a donde estaba (solo rutas de esta tienda).
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.unexpectedError"));
    } finally {
      setLoading(false);
    }
  }

  function handleSocialLogin(provider: "google" | "facebook") {
    if (!oauthStatus?.[provider]) {
      setError(t("login.oauthNotConfigured", { provider: provider === "google" ? "Google" : "Facebook" }));
      return;
    }
    window.location.href = `${API_URL}/auth/${provider}`;
  }

  return (
    <AuthCard
      title={mode === "login" ? t("login.titleLogin") : t("login.titleRegister")}
      subtitle={mode === "login" ? t("login.subtitleLogin") : t("login.subtitleRegister")}
      footer={
        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {mode === "login" ? t("login.noAccount") : t("login.hasAccount")}
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <Field label={t("login.email")}>
          {(control) => (
            <Input
              {...control}
              name="email"
              type="email"
              required
              defaultValue={mode === "login" ? rememberedEmail : undefined}
              autoComplete="username"
            />
          )}
        </Field>
        {mode === "register" ? (
          <Field label={t("login.phone")} hint={t("login.phoneHint")}>
            {(control) => <Input {...control} name="phone" type="tel" required minLength={7} placeholder={t("login.phonePlaceholder")} />}
          </Field>
        ) : null}
        <div className="grid gap-2">
          <Field label={t("login.password")}>
            {(control) => (
              <Input
                {...control}
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            )}
          </Field>
          {mode === "login" ? (
            <Link
              href="/forgot-password"
              className="justify-self-end text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t("login.forgotPassword")}
            </Link>
          ) : null}
        </div>

        {mode === "login" ? (
          <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 shrink-0" />
            {t("login.rememberMe")}
          </label>
        ) : (
          // Autorización previa, expresa e informada (Ley 1581 de 2012); las ofertas, aparte y opcionales.
          <div className="grid gap-2.5 text-sm text-muted-foreground">
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="acceptPrivacy" required className="mt-0.5 size-4 shrink-0" />
              <span>
                {t("login.acceptPrivacy")}{" "}
                <Link href="/privacidad" target="_blank" className="font-semibold text-foreground underline underline-offset-4">
                  {t("login.privacyPolicy")}
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" name="marketing" className="mt-0.5 size-4 shrink-0" />
              {t("login.acceptMarketing")}
            </label>
          </div>
        )}

        {error ? (
          <p role="alert" className="rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="dark" size="lg" block loading={loading}>
          {loading ? t("login.loading") : mode === "login" ? t("login.signIn") : t("login.createAccount")}
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span aria-hidden className="h-px flex-1 bg-border" />
          {t("login.orContinueWith")}
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSocialLogin("google")}
            title={oauthStatus && !oauthStatus.google ? t("login.googleSoon") : t("login.googleContinue")}
            aria-label={t("login.googleContinue")}
            className={cn(buttonStyles({ variant: "secondary" }), oauthStatus && !oauthStatus.google && "opacity-50")}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.04l3-2.33Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
            </svg>
            Google
          </button>
          <button
            type="button"
            onClick={() => handleSocialLogin("facebook")}
            title={oauthStatus && !oauthStatus.facebook ? t("login.facebookSoon") : t("login.facebookContinue")}
            aria-label={t("login.facebookContinue")}
            className={cn(buttonStyles({ variant: "secondary" }), oauthStatus && !oauthStatus.facebook && "opacity-50")}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="#1877F2" aria-hidden="true">
              <path d="M18 9a9 9 0 1 0-10.4 8.9v-6.3H5.3V9h2.3V7.1c0-2.3 1.36-3.55 3.44-3.55.99 0 2.03.18 2.03.18v2.23h-1.14c-1.13 0-1.48.7-1.48 1.42V9h2.52l-.4 2.6h-2.12v6.3A9 9 0 0 0 18 9Z" />
            </svg>
            Facebook
          </button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {t("login.socialNotice")}{" "}
          <Link href="/privacidad" target="_blank" className="underline underline-offset-4">
            {t("login.privacyPolicy")}
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}
