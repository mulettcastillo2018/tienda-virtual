"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ShieldCheck } from "lucide-react";
import { apiFetch, ApiError, API_URL } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useCartStore } from "@/store/cart.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

interface PrivacyState {
  privacyAcceptedAt: string | null;
  privacyVersion: string | null;
  currentVersion: string;
  needsAcceptance: boolean;
  marketingOptIn: boolean;
  hasPassword: boolean;
}

/** Derechos del titular (Ley 1581 de 2012): autorización, ofertas, descargar y suprimir. */
export function PrivacySettings() {
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const showToast = useToastStore((state) => state.show);
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [state, setState] = useState<PrivacyState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setState(await apiFetch<PrivacyState>("/privacy/me", { token }));
  }

  useEffect(() => {
    load().catch(() => setError(t("privacy.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function run(key: string, action: () => Promise<void>) {
    setError(null);
    setBusy(key);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("privacy.actionError"));
    } finally {
      setBusy(null);
    }
  }

  const accept = () =>
    run("accept", async () => {
      await apiFetch("/privacy/accept", { method: "POST", token });
      await load();
      showToast(t("privacy.acceptedToast"));
    });

  const toggleMarketing = (optIn: boolean) =>
    run("marketing", async () => {
      await apiFetch("/privacy/marketing", { method: "PUT", token, body: JSON.stringify({ optIn }) });
      await load();
    });

  // El archivo llega como JSON: se descarga sin abrir otra pestaña.
  const download = () =>
    run("export", async () => {
      const res = await fetch(`${API_URL}/privacy/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement | null)?.value;
    await run("delete", async () => {
      await apiFetch("/privacy/delete-account", { method: "POST", token, body: JSON.stringify({ confirm, password }) });
      logout();
      useCartStore.setState({ cart: null });
      router.push("/");
      showToast(t("privacy.deletedToast"));
    });
  }

  if (!state) return error ? <p className="text-sm font-medium text-peligro">{error}</p> : null;
  const acceptedOn = state.privacyAcceptedAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "long" }).format(new Date(state.privacyAcceptedAt))
    : null;

  return (
    <div className="grid gap-5 text-sm">
      {error ? <p className="font-medium text-peligro">{error}</p> : null}

      {state.needsAcceptance ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-aviso/40 bg-aviso/10 p-4">
          <p className="max-w-prose">
            {t("privacy.needsAcceptance")}{" "}
            <Link href="/privacidad" target="_blank" className="font-semibold underline underline-offset-4">
              {t("login.privacyPolicy")}
            </Link>
            .
          </p>
          <Button variant="dark" size="sm" loading={busy === "accept"} onClick={accept}>
            {t("privacy.accept")}
          </Button>
        </div>
      ) : (
        <p className="flex items-start gap-2 text-muted-foreground">
          <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-exito" />
          <span>
            {t("privacy.acceptedOn", { date: acceptedOn ?? "—", version: state.privacyVersion ?? "" })}{" "}
            <Link href="/privacidad" className="underline underline-offset-4">
              {t("privacy.readPolicy")}
            </Link>
          </span>
        </p>
      )}

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={state.marketingOptIn}
          disabled={busy === "marketing"}
          onChange={(event) => toggleMarketing(event.target.checked)}
          className="mt-0.5 size-4 shrink-0"
        />
        <span>
          <span className="font-medium">{t("privacy.marketing")}</span>
          <span className="block text-muted-foreground">{t("privacy.marketingHint")}</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" loading={busy === "export"} onClick={download}>
          <Download aria-hidden />
          {t("privacy.download")}
        </Button>
        {!deleting ? (
          <Button variant="ghost" size="sm" onClick={() => setDeleting(true)} className="hover:text-peligro">
            {t("privacy.deleteAccount")}
          </Button>
        ) : null}
      </div>

      {deleting ? (
        <form onSubmit={handleDelete} className="animate-aparecer grid gap-3 rounded-2xl border border-peligro/30 bg-peligro/5 p-4">
          <p className="font-semibold text-peligro">{t("privacy.deleteTitle")}</p>
          <p className="text-muted-foreground">{t("privacy.deleteExplain")}</p>
          <Field label={t("privacy.deleteConfirm")}>{(control) => <Input {...control} name="confirm" required autoComplete="off" placeholder="ELIMINAR" />}</Field>
          {state.hasPassword ? (
            <Field label={t("privacy.deletePassword")}>{(control) => <Input {...control} name="password" type="password" required autoComplete="current-password" />}</Field>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" size="sm" loading={busy === "delete"}>
              {t("privacy.deleteFinal")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
