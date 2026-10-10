"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { AuthCard } from "@/components/ui/AuthCard";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

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
    <AuthCard
      title={t("forgotPassword.title")}
      subtitle={submitted ? undefined : t("forgotPassword.prompt")}
      footer={
        <Link href="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">
          {t("forgotPassword.backToLogin")}
        </Link>
      }
    >
      {submitted ? (
        <div className="animate-aparecer flex flex-col items-center gap-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-exito/12 text-exito">
            <MailCheck size={26} aria-hidden />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("forgotPassword.submittedMessage")}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          <Field label={t("forgotPassword.email")}>
            {(control) => <Input {...control} name="email" type="email" required autoComplete="email" />}
          </Field>
          <Button type="submit" variant="dark" size="lg" block loading={loading}>
            {loading ? t("forgotPassword.sending") : t("forgotPassword.sendLink")}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
