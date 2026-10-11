"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Banknote } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { CodSettings } from "@/lib/types";

/** Reglas del pago contra entrega: si se ofrece, en qué ciudades, hasta qué valor y con qué recargo. */
export function CashOnDeliverySettings() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [cities, setCities] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [fee, setFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function show(settings: CodSettings) {
    setEnabled(settings.codEnabled);
    setCities(settings.codCities.join("\n"));
    setMaxAmount(String(settings.codMaxAmount));
    setFee(String(settings.codFee));
    setLoaded(true);
  }

  useEffect(() => {
    if (!token) return;
    apiFetch<CodSettings>("/settings/cash-on-delivery", { token })
      .then(show)
      .catch(() => setError(t("adminCod.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const saved = await apiFetch<CodSettings>("/settings/cash-on-delivery", {
        method: "PUT",
        token,
        body: JSON.stringify({
          codEnabled: enabled,
          // Una ciudad por línea (o separadas por comas).
          codCities: cities
            .split(/[\n,]/)
            .map((city) => city.trim())
            .filter(Boolean),
          codMaxAmount: Number(maxAmount),
          codFee: Number(fee || 0),
        }),
      });
      show(saved);
      showToast(t("adminCod.savedToast"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminCod.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-suave sm:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <Banknote size={18} aria-hidden />
        {t("adminCod.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("adminCod.hint")}</p>
      {error ? <p className="mt-3 text-sm font-medium text-peligro">{error}</p> : null}
      {loaded ? (
        <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
          <label className="flex items-center gap-2.5 text-sm font-medium">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-4" />
            {t("adminCod.enabled")}
          </label>
          <Field label={t("adminCod.cities")} hint={t("adminCod.citiesHint")}>
            {(control) => <Textarea {...control} value={cities} onChange={(event) => setCities(event.target.value)} rows={6} className="min-h-40" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("adminCod.maxAmount")} hint={t("adminCod.maxAmountHint")}>
              {(control) => (
                <Input {...control} type="number" min={10000} step={1000} required value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} />
              )}
            </Field>
            <Field label={t("adminCod.fee")} hint={t("adminCod.feeHint")}>
              {(control) => <Input {...control} type="number" min={0} step={500} value={fee} onChange={(event) => setFee(event.target.value)} />}
            </Field>
          </div>
          <div>
            <Button type="submit" variant="dark" loading={saving}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
