"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useT } from "@/lib/i18n";
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

    const oauthError = new URLSearchParams(window.location.search).get("oauthError");
    if (oauthError) {
      setError(oauthError);
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

    try {
      const data = await apiFetch<{ token: string; user: AuthUser }>(
        mode === "login" ? "/auth/login" : "/auth/register",
        { method: "POST", body: JSON.stringify({ email, password, ...(phone ? { phone } : {}) }) }
      );

      if (mode === "login") {
        if (remember) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      }

      setAuth(data.token, data.user, remember);
      router.push("/");
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
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="brand-gradient-text text-center text-2xl font-extrabold tracking-tight">Tienda Virtual</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t("login.email")}</label>
          <input
            name="email"
            type="email"
            required
            defaultValue={mode === "login" ? rememberedEmail : undefined}
            autoComplete="username"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        {mode === "register" ? (
          <div>
            <label className="mb-1 block text-sm font-medium">{t("login.phone")}</label>
            <input
              name="phone"
              type="tel"
              required
              minLength={7}
              placeholder={t("login.phonePlaceholder")}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("login.phoneHint")}</p>
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-sm font-medium">{t("login.password")}</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {mode === "login" ? (
            <Link href="/forgot-password" className="mt-1 inline-block text-xs text-muted-foreground underline">
              {t("login.forgotPassword")}
            </Link>
          ) : null}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => handleSocialLogin("google")}
            title={oauthStatus && !oauthStatus.google ? t("login.googleSoon") : t("login.googleContinue")}
            aria-label={t("login.googleContinue")}
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-border transition-all duration-200 ${
              oauthStatus && !oauthStatus.google
                ? "opacity-50"
                : "hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
              <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.04l3-2.33Z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => handleSocialLogin("facebook")}
            title={oauthStatus && !oauthStatus.facebook ? t("login.facebookSoon") : t("login.facebookContinue")}
            aria-label={t("login.facebookContinue")}
            className={`flex h-10 w-10 items-center justify-center rounded-full border border-border transition-all duration-200 ${
              oauthStatus && !oauthStatus.facebook
                ? "opacity-50"
                : "hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="#1877F2" aria-hidden="true">
              <path d="M18 9a9 9 0 1 0-10.4 8.9v-6.3H5.3V9h2.3V7.1c0-2.3 1.36-3.55 3.44-3.55.99 0 2.03.18 2.03.18v2.23h-1.14c-1.13 0-1.48.7-1.48 1.42V9h2.52l-.4 2.6h-2.12v6.3A9 9 0 0 0 18 9Z" />
            </svg>
          </button>
        </div>

        {mode === "login" ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t("login.rememberMe")}
          </label>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full rounded-full px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t("login.loading") : mode === "login" ? t("login.signIn") : t("login.createAccount")}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "login" ? "register" : "login")}
        className="mt-4 block w-full text-center text-sm text-muted-foreground underline"
      >
        {mode === "login" ? t("login.noAccount") : t("login.hasAccount")}
      </button>
    </div>
  );
}
