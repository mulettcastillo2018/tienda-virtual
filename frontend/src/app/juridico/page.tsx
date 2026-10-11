"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError, uploadFile } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { PqrsTimeline } from "@/components/PqrsTimeline";
import { useT, useLocale } from "@/lib/i18n";
import { PQRS_STATUS_TONE } from "@/lib/statusTones";
import { Badge } from "@/components/ui/Badge";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Pagination } from "@/components/ui/Pagination";
import { SearchForm } from "@/components/ui/SearchForm";
import type { Pqrs, PqrsStatus } from "@/lib/types";

const PQRS_STATUSES: PqrsStatus[] = ["RECIBIDO", "EN_PROCESO", "RESUELTO", "CERRADO"];

const PAGE_SIZE = 20;

function formatDate(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(iso)
  );
}

export default function JuridicoPqrsPage() {
  const token = useAuthStore((state) => state.token);
  const showToast = useToastStore((state) => state.show);
  const [statusFilter, setStatusFilter] = useState<PqrsStatus | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<PqrsStatus | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const t = useT();
  const locale = useLocale();

  const list = usePagedList<{ items: Pqrs[]; total: number; counts: Partial<Record<PqrsStatus | "ALL", number>> }>(
    "/pqrs",
    { page, pageSize: PAGE_SIZE, status: statusFilter === "ALL" ? undefined : statusFilter, q: query },
    t("juridico.loadError")
  );
  const visibleItems = list.data?.items ?? [];
  const counts = list.data?.counts ?? {};

  function startManaging(pqrs: Pqrs) {
    setOpenId(pqrs.id);
    setDraftStatus(pqrs.status);
    setAttachment(null);
    setError(null);
  }

  async function handleRespond(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !draftStatus) return;

    const form = event.currentTarget;
    const response = (form.elements.namedItem("response") as HTMLTextAreaElement).value.trim();
    const comment = (form.elements.namedItem("comment") as HTMLTextAreaElement).value.trim();

    setError(null);
    setSaving(true);
    try {
      let responseAttachmentKey: string | undefined;
      if (attachment) {
        const { key } = await uploadFile<{ key: string }>("/uploads/pqrs-attachment", attachment, token);
        responseAttachmentKey = key;
      }

      await apiFetch(`/pqrs/${id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          status: draftStatus,
          ...(response ? { response } : {}),
          ...(comment ? { comment } : {}),
          ...(responseAttachmentKey ? { responseAttachmentKey } : {}),
        }),
      });
      setOpenId(null);
      showToast(t("juridico.updatedToast"));
      list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("juridico.updateError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <FilterTabs
        options={[
          { value: "ALL" as const, label: t("juridico.all"), count: counts.ALL ?? 0 },
          ...PQRS_STATUSES.map((value) => ({ value, label: t(`pqrsStatus.${value}`), count: counts[value] ?? 0 })),
        ]}
        value={statusFilter}
        onChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
      />
      <SearchForm
        placeholder={t("juridico.searchPlaceholder")}
        onSearch={(value) => {
          setQuery(value);
          setPage(1);
        }}
      />
      {list.error ? <p className="text-sm font-medium text-peligro">{list.error}</p> : null}

      {!list.data ? null : visibleItems.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("juridico.noRequests")}</p>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((pqrs) => (
            <div key={pqrs.id} className="rounded-2xl border border-border p-4 bg-surface shadow-suave">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {t(`pqrsType.${pqrs.type}`)}: {pqrs.subject}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pqrs.user?.email} · {pqrs.user?.phone} · {formatDate(pqrs.createdAt, locale)}
                  </p>
                  {pqrs.order ? (
                    <p className="text-sm text-muted-foreground">{t("juridico.orderNumber", { id: pqrs.order.id.slice(-8) })}</p>
                  ) : null}
                </div>
                <Badge tone={PQRS_STATUS_TONE[pqrs.status]}>{t(`pqrsStatus.${pqrs.status}`)}</Badge>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{pqrs.message}</p>
              {pqrs.attachmentUrl ? (
                <a
                  href={pqrs.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-foreground underline underline-offset-4"
                >
                  {t("juridico.viewClientAttachment")}
                </a>
              ) : null}

              {pqrs.response ? (
                <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
                  <p className="font-semibold">
                    {t("juridico.responseToClient", {
                      by: [pqrs.respondedBy ? `— ${pqrs.respondedBy.email}` : "", pqrs.respondedAt ? ` (${formatDate(pqrs.respondedAt, locale)})` : ""].join(""),
                    })}
                  </p>
                  <p className="mt-1 text-muted-foreground">{pqrs.response}</p>
                  {pqrs.responseAttachmentUrl ? (
                    <a
                      href={pqrs.responseAttachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-semibold text-foreground underline underline-offset-4"
                    >
                      {t("juridico.viewSentAttachment")}
                    </a>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4">
                <PqrsTimeline
                  pqrs={pqrs}
                  showComments
                  interactive={openId === pqrs.id}
                  selectedStatus={openId === pqrs.id ? (draftStatus ?? undefined) : undefined}
                  onSelectStatus={openId === pqrs.id ? setDraftStatus : undefined}
                />
              </div>

              {openId === pqrs.id ? (
                <form onSubmit={(e) => handleRespond(pqrs.id, e)} className="mt-4 space-y-2 border-t border-border pt-3">
                  {error ? <p className="text-sm text-peligro font-medium">{error}</p> : null}
                  <p className="text-xs text-muted-foreground">{t("juridico.clickTimelineHint")}</p>
                  <textarea
                    name="response"
                    placeholder={t("juridico.responsePlaceholder")}
                    rows={3}
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface"
                  />
                  <textarea
                    name="comment"
                    placeholder={t("juridico.commentPlaceholder")}
                    rows={2}
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-sm bg-surface"
                  />
                  <label className="block text-sm text-muted-foreground">
                    {t("juridico.attachEvidence")}
                    <input
                      type="file"
                      accept="image/*,video/mp4,video/webm,video/quicktime"
                      onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                      className="mt-1 block w-full text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? t("juridico.saving") : t("juridico.save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      className="rounded-full border border-border px-4 h-9 text-sm text-muted-foreground inline-flex items-center justify-center bg-surface font-medium transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      {t("juridico.cancel")}
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => startManaging(pqrs)} className="mt-3 text-sm font-semibold text-foreground underline-offset-4 hover:underline">
                  {t("juridico.manage")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
