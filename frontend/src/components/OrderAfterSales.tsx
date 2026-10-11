"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FileText, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useT, useLocale } from "@/lib/i18n";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Field";
import type { Order, ReturnKind, ReturnStatus } from "@/lib/types";

const STATUS_TONE: Record<ReturnStatus, BadgeTone> = {
  REQUESTED: "warning",
  APPROVED: "neutral",
  RECEIVED: "neutral",
  REFUNDED: "success",
  REJECTED: "danger",
};

export interface ReturnBody {
  type: ReturnKind;
  cause?: string;
  note?: string;
}

/**
 * Después de la compra: la factura electrónica, las solicitudes de retracto o
 * reversión con su estado y, si todavía se puede, el botón para pedirlas.
 */
export function OrderAfterSales({ order, submit }: { order: Order; submit: (body: ReturnBody) => Promise<void> }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState<ReturnKind | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium" }).format(new Date(iso));
  const requests = order.returnRequests ?? [];
  const invoices = order.invoices ?? [];
  const options = order.returnOptions;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open) return;
    const form = event.currentTarget;
    const note = (form.elements.namedItem("note") as HTMLTextAreaElement).value.trim();
    const cause = (form.elements.namedItem("cause") as HTMLSelectElement | null)?.value;
    setError(null);
    setSending(true);
    try {
      await submit({ type: open, ...(cause ? { cause } : {}), ...(note ? { note } : {}) });
      setOpen(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("afterSales.error"));
    } finally {
      setSending(false);
    }
  }

  if (invoices.length === 0 && requests.length === 0 && !options?.RETRACTO.available && !options?.REVERSION.available) return null;

  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4 text-sm">
      {invoices.map((invoice) => (
        <p key={invoice.fullNumber} className="flex items-start gap-2 text-muted-foreground">
          <FileText size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {t(invoice.type === "INVOICE" ? "afterSales.invoice" : "afterSales.creditNote", { number: invoice.fullNumber, date: date(invoice.createdAt) })}
            {invoice.uniqueCode ? <span className="block text-[11px] break-all">CUFE: {invoice.uniqueCode}</span> : null}
          </span>
        </p>
      ))}

      {requests.map((request) => (
        <div key={request.id} className="rounded-2xl bg-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold">
              <RotateCcw size={15} aria-hidden />
              {t(`afterSales.type.${request.type}`)}
              <span className="font-normal text-muted-foreground">· {date(request.createdAt)}</span>
            </p>
            <Badge tone={STATUS_TONE[request.status]}>{t(`afterSales.status.${request.status}`)}</Badge>
          </div>
          {request.cause ? <p className="mt-1 text-muted-foreground">{t(`afterSales.cause.${request.cause}`)}</p> : null}
          {request.storeNote ? <p className="mt-1">{request.storeNote}</p> : null}
          {request.refundReference ? <p className="mt-1 text-muted-foreground">{t("afterSales.refundReference", { reference: request.refundReference })}</p> : null}
        </div>
      ))}

      {error ? <p className="font-medium text-peligro">{error}</p> : null}

      {open ? (
        <form onSubmit={handleSubmit} className="animate-aparecer grid gap-3 rounded-2xl border border-border p-4">
          <p className="font-semibold">{t(`afterSales.type.${open}`)}</p>
          <p className="text-muted-foreground">
            {t(open === "RETRACTO" ? "afterSales.retractoExplain" : "afterSales.reversionExplain")}{" "}
            <Link href="/devoluciones" target="_blank" className="underline underline-offset-4">
              {t("afterSales.moreInfo")}
            </Link>
          </p>
          {open === "REVERSION" ? (
            <Field label={t("afterSales.causeLabel")}>
              {(control) => (
                <Select {...control} name="cause" required defaultValue="">
                  <option value="" disabled>
                    {t("afterSales.causePick")}
                  </option>
                  {(["FRAUDE", "NO_SOLICITADA", "NO_RECIBIDO", "DEFECTUOSO"] as const).map((cause) => (
                    <option key={cause} value={cause}>
                      {t(`afterSales.cause.${cause}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <Field label={t("afterSales.noteLabel")}>{(control) => <Textarea {...control} name="note" maxLength={1000} className="min-h-20" />}</Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="dark" size="sm" loading={sending}>
              {t("afterSales.send")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options?.RETRACTO.available ? (
            <Button variant="secondary" size="sm" onClick={() => setOpen("RETRACTO")}>
              {t("afterSales.requestRetracto")}
            </Button>
          ) : null}
          {options?.REVERSION.available ? (
            <Button variant="ghost" size="sm" onClick={() => setOpen("REVERSION")}>
              {t("afterSales.requestReversion")}
            </Button>
          ) : null}
          {options?.RETRACTO.available && options.RETRACTO.deadline ? (
            <p className="basis-full text-xs text-muted-foreground">{t("afterSales.deadline", { date: date(options.RETRACTO.deadline) })}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
