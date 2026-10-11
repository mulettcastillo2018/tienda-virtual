"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, RefreshCw } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Pagination } from "@/components/ui/Pagination";
import type { FiscalDocumentRow, FiscalDocumentStatus, FiscalSettingsView } from "@/lib/types";

const PAGE_SIZE = 20;
const STATUSES: FiscalDocumentStatus[] = ["PENDING", "SENT", "ACCEPTED", "REJECTED"];
const TONE: Record<FiscalDocumentStatus, BadgeTone> = { PENDING: "warning", SENT: "neutral", ACCEPTED: "success", REJECTED: "danger" };

function formatCOP(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

// Factura electrónica (DIAN) con Alanube: configuración y documentos emitidos.
export default function AdminBillingPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const locale = useLocale();
  const [settings, setSettings] = useState<FiscalSettingsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FiscalDocumentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const docs = usePagedList<{ items: FiscalDocumentRow[]; total: number; counts: Partial<Record<FiscalDocumentStatus | "ALL", number>> }>(
    "/fiscal/documents",
    { page, pageSize: PAGE_SIZE, status: tab === "ALL" ? undefined : tab },
    t("adminBilling.loadError")
  );

  useEffect(() => {
    if (!token) return;
    apiFetch<FiscalSettingsView>("/fiscal/settings", { token })
      .then(setSettings)
      .catch(() => setError(t("adminBilling.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value.trim();
    const number = (name: string) => (value(name) === "" ? null : Number(value(name)));
    const text = (name: string) => value(name) || null;
    setError(null);
    setSaving(true);
    try {
      const saved = await apiFetch<FiscalSettingsView>("/fiscal/settings", {
        method: "PUT",
        token,
        body: JSON.stringify({
          enabled: (form.elements.namedItem("enabled") as HTMLInputElement).checked,
          alanubeUrl: value("alanubeUrl"),
          // Vacío: se conserva el token guardado.
          alanubeToken: value("alanubeToken") || undefined,
          alanubeCompanyId: text("alanubeCompanyId"),
          resolutionNumber: text("resolutionNumber"),
          prefix: text("prefix"),
          rangeFrom: number("rangeFrom"),
          rangeTo: number("rangeTo"),
          startDate: text("startDate"),
          endDate: text("endDate"),
          technicalKey: text("technicalKey"),
          nextNumber: number("nextNumber"),
          creditNotePrefix: value("creditNotePrefix"),
          creditNoteNext: Number(value("creditNoteNext")),
          shippingTaxRate: Number(value("shippingTaxRate")),
        }),
      });
      setSettings(saved);
      (form.elements.namedItem("alanubeToken") as HTMLInputElement).value = "";
      showToast(t("adminBilling.savedToast"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminBilling.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function processNow() {
    setProcessing(true);
    try {
      setSettings(await apiFetch<FiscalSettingsView>("/fiscal/process", { method: "POST", token }));
      docs.reload();
    } finally {
      setProcessing(false);
    }
  }

  async function resend(id: string) {
    setError(null);
    try {
      await apiFetch(`/fiscal/documents/${id}/resend`, { method: "POST", token });
      showToast(t("adminBilling.resentToast"));
      docs.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminBilling.saveError"));
    }
  }

  if (!settings) return error ? <p className="text-sm font-medium text-peligro">{error}</p> : <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  const ready = settings.missing.length === 0;
  const counts = docs.data?.counts ?? {};
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("adminBilling.hint")}</p>

      <div className={`rounded-2xl border p-4 text-sm ${ready && settings.enabled ? "border-exito/40 bg-exito/5" : "border-aviso/40 bg-aviso/10"}`}>
        {ready ? (
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={16} aria-hidden className="text-exito" />
            {settings.enabled ? t("adminBilling.active") : t("adminBilling.readyInactive")}
          </p>
        ) : (
          <p className="flex items-start gap-2">
            <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {t("adminBilling.missing", { items: settings.missing.join(", ") })}{" "}
              {settings.missing.some((m) => m.includes("NIT")) ? (
                <Link href="/admin/contact" className="font-semibold underline underline-offset-4">
                  {t("adminBilling.goToContact")}
                </Link>
              ) : null}
            </span>
          </p>
        )}
        {settings.warnings.map((warning) => (
          <p key={warning} className="mt-1 font-medium text-aviso">
            {warning}
          </p>
        ))}
      </div>

      <form onSubmit={handleSave} className="grid gap-4 rounded-2xl border border-border bg-surface p-4 shadow-suave sm:grid-cols-2 sm:p-5">
        <label className="flex items-center gap-2.5 text-sm font-medium sm:col-span-2">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="size-4" />
          {t("adminBilling.enabled")}
        </label>
        <Field label={t("adminBilling.alanubeUrl")} hint={t("adminBilling.alanubeUrlHint")} className="sm:col-span-2">
          {(c) => <Input {...c} name="alanubeUrl" defaultValue={settings.alanubeUrl} required />}
        </Field>
        <Field
          label={t("adminBilling.token")}
          hint={settings.tokenFromEnv ? t("adminBilling.tokenFromEnv") : settings.tokenSaved ? t("adminBilling.tokenSaved") : t("adminBilling.tokenMissing")}
        >
          {(c) => <Input {...c} name="alanubeToken" type="password" autoComplete="off" disabled={settings.tokenFromEnv} />}
        </Field>
        <Field label={t("adminBilling.companyId")}>{(c) => <Input {...c} name="alanubeCompanyId" defaultValue={settings.alanubeCompanyId ?? ""} />}</Field>
        <Field label={t("adminBilling.resolution")}>{(c) => <Input {...c} name="resolutionNumber" defaultValue={settings.resolutionNumber ?? ""} />}</Field>
        <Field label={t("adminBilling.prefix")}>{(c) => <Input {...c} name="prefix" defaultValue={settings.prefix ?? ""} maxLength={10} />}</Field>
        <Field label={t("adminBilling.rangeFrom")}>{(c) => <Input {...c} name="rangeFrom" type="number" min={1} defaultValue={settings.rangeFrom ?? ""} />}</Field>
        <Field label={t("adminBilling.rangeTo")}>{(c) => <Input {...c} name="rangeTo" type="number" min={1} defaultValue={settings.rangeTo ?? ""} />}</Field>
        <Field label={t("adminBilling.startDate")}>{(c) => <Input {...c} name="startDate" type="date" defaultValue={settings.startDate ?? ""} />}</Field>
        <Field label={t("adminBilling.endDate")}>{(c) => <Input {...c} name="endDate" type="date" defaultValue={settings.endDate ?? ""} />}</Field>
        <Field label={t("adminBilling.technicalKey")} className="sm:col-span-2">
          {(c) => <Input {...c} name="technicalKey" defaultValue={settings.technicalKey ?? ""} autoComplete="off" />}
        </Field>
        <Field label={t("adminBilling.nextNumber")} hint={t("adminBilling.nextNumberHint")}>
          {(c) => <Input {...c} name="nextNumber" type="number" min={1} defaultValue={settings.nextNumber ?? ""} />}
        </Field>
        <Field label={t("adminBilling.shippingTax")}>
          {(c) => (
            <Select {...c} name="shippingTaxRate" defaultValue={String(settings.shippingTaxRate)}>
              <option value="0">{t("productForm.tax0")}</option>
              <option value="5">{t("productForm.tax5")}</option>
              <option value="19">{t("productForm.tax19")}</option>
            </Select>
          )}
        </Field>
        <Field label={t("adminBilling.creditNotePrefix")}>{(c) => <Input {...c} name="creditNotePrefix" defaultValue={settings.creditNotePrefix} required maxLength={10} />}</Field>
        <Field label={t("adminBilling.creditNoteNext")}>{(c) => <Input {...c} name="creditNoteNext" type="number" min={1} defaultValue={settings.creditNoteNext} required />}</Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" variant="dark" loading={saving}>
            {t("common.save")}
          </Button>
          <Button variant="secondary" loading={processing} onClick={processNow}>
            <RefreshCw aria-hidden />
            {t("adminBilling.processNow")}
          </Button>
        </div>
        {error ? <p className="text-sm font-medium text-peligro sm:col-span-2">{error}</p> : null}
      </form>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <FileText size={16} aria-hidden />
          {t("adminBilling.documents")}
        </h2>
        <FilterTabs
          options={[
            { value: "ALL" as const, label: t("adminBilling.all"), count: counts.ALL ?? 0 },
            ...STATUSES.map((value) => ({ value, label: t(`adminBilling.status.${value}`), count: counts[value] ?? 0 })),
          ]}
          value={tab}
          onChange={(value) => {
            setTab(value);
            setPage(1);
          }}
        />
        {docs.data && docs.data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("adminBilling.empty")}</p>
        ) : null}
        {docs.data?.items.map((doc) => (
          <div key={doc.id} className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-suave">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {t(doc.type === "INVOICE" ? "adminBilling.invoice" : "adminBilling.creditNote")} {doc.prefix}
                  {doc.number}
                  {doc.cancels ? <span className="font-normal text-muted-foreground"> · {t("adminBilling.cancels", { number: `${doc.cancels.prefix}${doc.cancels.number}` })}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {date(doc.createdAt)} · #{doc.orderId.slice(-8)} · {doc.customerName} ({doc.customerId}) · {formatCOP(doc.total)}
                </p>
              </div>
              <Badge tone={TONE[doc.status]}>{t(`adminBilling.status.${doc.status}`)}</Badge>
            </div>
            {doc.uniqueCode ? <p className="mt-1 text-[11px] break-all text-muted-foreground">CUFE/CUDE: {doc.uniqueCode}</p> : null}
            {doc.message && doc.status !== "ACCEPTED" ? <p className="mt-1 text-muted-foreground">{doc.message}</p> : null}
            {doc.errors.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-peligro">
                {doc.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            {doc.status === "REJECTED" ? (
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => resend(doc.id)}>
                {t("adminBilling.resend")}
              </Button>
            ) : null}
          </div>
        ))}
        <Pagination page={page} pageSize={PAGE_SIZE} total={docs.data?.total ?? 0} onChange={setPage} />
      </section>
    </div>
  );
}
