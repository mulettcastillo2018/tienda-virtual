"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { useToastStore } from "@/store/toast.store";
import { useT } from "@/lib/i18n";
import { AuthCard } from "@/components/ui/AuthCard";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

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
      <p role="alert" className="rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
        {t("resetPassword.invalidLink")}{" "}
        <Link href="/forgot-password" className="underline underline-offset-4">
          {t("resetPassword.requestNew")}
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Field label={t("resetPassword.newPassword")}>
        {(control) => <Input {...control} name="newPassword" type="password" required minLength={8} autoComplete="new-password" />}
      </Field>
      <Field label={t("resetPassword.confirmPassword")}>
        {(control) => <Input {...control} name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />}
      </Field>
      {error ? (
        <p role="alert" className="rounded-2xl bg-peligro/10 px-4 py-3 text-sm font-medium text-peligro">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="dark" size="lg" block loading={loading}>
        {loading ? t("resetPassword.saving") : t("resetPassword.resetButton")}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useT();
  return (
    <AuthCard title={t("resetPassword.title")}>
      <Suspense fallback={<p className="text-center text-sm text-muted-foreground">{t("resetPassword.loading")}</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
