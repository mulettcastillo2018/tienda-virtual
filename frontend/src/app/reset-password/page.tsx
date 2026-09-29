"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useToastStore } from "@/store/toast.store";
import { useT } from "@/lib/i18n";

function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const showToast = useToastStore((state) => state.show);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const t = useT();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const field = (name: string) =>
      (event.currentTarget.elements.namedItem(name) as HTMLInputElement).value;
    const newPassword = field("newPassword");
    const confirmPassword = field("confirmPassword");

    if (newPassword !== confirmPassword) {
      setError(t("resetPassword.passwordMismatch"));
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      showToast(t("resetPassword.resetSuccessToast"));
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("resetPassword.resetError"));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="mt-6 text-sm text-red-600">
        {t("resetPassword.invalidLink")}{" "}
        <Link href="/forgot-password" className="underline">
          {t("resetPassword.requestNew")}
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <input
        name="newPassword"
        type="password"
        required
        minLength={8}
        placeholder={t("resetPassword.newPassword")}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <input
        name="confirmPassword"
        type="password"
        required
        minLength={8}
        placeholder={t("resetPassword.confirmPassword")}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full rounded-full px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? t("resetPassword.saving") : t("resetPassword.resetButton")}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-sm px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-bold">{t("resetPassword.title")}</h1>
      <Suspense fallback={<p className="mt-6 text-sm text-muted-foreground">{t("resetPassword.loading")}</p>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
