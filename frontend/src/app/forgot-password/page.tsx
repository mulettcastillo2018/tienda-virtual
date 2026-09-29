"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const t = useT();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const email = (event.currentTarget.elements.namedItem("email") as HTMLInputElement).value;

    try {
      await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    } finally {
      // Siempre mostramos el mismo mensaje, exista o no la cuenta.
      setSubmitted(true);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold">{t("forgotPassword.title")}</h1>

      {submitted ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("forgotPassword.submittedMessage")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{t("forgotPassword.prompt")}</p>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              name="email"
              type="email"
              required
              placeholder={t("forgotPassword.email")}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full rounded-full px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("forgotPassword.sending") : t("forgotPassword.sendLink")}
            </button>
          </form>
        </>
      )}

      <Link href="/login" className="mt-4 inline-block text-sm text-muted-foreground underline">
        {t("forgotPassword.backToLogin")}
      </Link>
    </div>
  );
}
