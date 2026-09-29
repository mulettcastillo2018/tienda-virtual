"use client";

import { Check, FileImage, FileVideo } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n";
import type { Pqrs, PqrsStatus, PqrsStatusLog } from "@/lib/types";

const STATUS_ORDER: PqrsStatus[] = ["RECIBIDO", "EN_PROCESO", "RESUELTO", "CERRADO"];

function formatDate(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}

// Los adjuntos llegan como enlaces firmados (…/archivo.mp4?exp=…&sig=…).
function isMedia(url: string) {
  return /\.(mp4|webm|mov)$/i.test(url.split("?")[0]) ? "video" : "image";
}

function AttachmentPreview({ url, label }: { url: string; label: string }) {
  const kind = isMedia(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-1 text-xs font-semibold text-accent underline"
    >
      {kind === "video" ? <FileVideo size={14} /> : <FileImage size={14} />}
      {label}
    </a>
  );
}

interface PqrsTimelineProps {
  pqrs: Pqrs;
  interactive?: boolean;
  selectedStatus?: PqrsStatus;
  onSelectStatus?: (status: PqrsStatus) => void;
  /** Muestra los comentarios internos de gestión — solo para Jurídico/Admin, no para el cliente. */
  showComments?: boolean;
}

export function PqrsTimeline({ pqrs, interactive, selectedStatus, onSelectStatus, showComments }: PqrsTimelineProps) {
  const t = useT();
  const locale = useLocale();
  const ROLE_LABELS: Record<string, string> = {
    ADMIN: t("pqrsTimeline.roleAdmin"),
    JURIDICO: t("pqrsTimeline.roleJuridico"),
    CUSTOMER: t("pqrsTimeline.roleCustomer"),
  };
  const currentIndex = STATUS_ORDER.indexOf(selectedStatus ?? pqrs.status);
  const logs = pqrs.statusLogs ?? [];
  const isOverdue = new Date(pqrs.dueAt) < new Date() && pqrs.status !== "RESUELTO" && pqrs.status !== "CERRADO";

  function firstLogFor(status: PqrsStatus): PqrsStatusLog | undefined {
    return logs.find((log) => log.toStatus === status);
  }

  return (
    <div>
      {/* Stepper */}
      <div className="flex items-start">
        {STATUS_ORDER.map((status, index) => {
          const reached = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const log = firstLogFor(status);
          const Node = interactive ? "button" : "div";

          return (
            <div key={status} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <div className={`h-0.5 flex-1 ${index === 0 ? "opacity-0" : reached ? "bg-accent" : "bg-border"}`} />
                <Node
                  type={interactive ? "button" : undefined}
                  onClick={interactive && onSelectStatus ? () => onSelectStatus(status) : undefined}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                    isCurrent
                      ? "border-accent bg-accent text-accent-foreground"
                      : reached
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-border text-muted-foreground"
                  } ${interactive ? "cursor-pointer hover:border-accent" : ""}`}
                >
                  {reached && !isCurrent ? <Check size={16} /> : index + 1}
                </Node>
                <div
                  className={`h-0.5 flex-1 ${
                    index === STATUS_ORDER.length - 1 ? "opacity-0" : reached && index < currentIndex ? "bg-accent" : "bg-border"
                  }`}
                />
              </div>
              <p className={`mt-2 text-xs font-semibold ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                {t(`pqrsStatus.${status}`)}
              </p>
              <p className="text-[11px] text-muted-foreground">{log ? formatDate(log.changedAt, locale) : "—"}</p>
            </div>
          );
        })}
      </div>

      {/* Fecha límite */}
      <p className={`mt-4 text-xs font-medium ${isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
        {isOverdue ? t("pqrsTimeline.deadlineOverdue") : t("pqrsTimeline.deadline")}: {formatDate(pqrs.dueAt, locale)}
      </p>

      {/* Trazabilidad detallada (comentarios internos) */}
      {showComments && logs.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {logs.map((log) => (
            <div key={log.id} className="text-sm">
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">{ROLE_LABELS[log.changedBy.role] ?? log.changedBy.role}</span>{" "}
                {log.changedBy.email ? `(${log.changedBy.email}) ` : ""}— {formatDate(log.changedAt, locale)}
              </p>
              <p className="text-muted-foreground">
                {log.fromStatus ? (
                  t("pqrsTimeline.changedFrom", { from: t(`pqrsStatus.${log.fromStatus}`), to: t(`pqrsStatus.${log.toStatus}`) })
                ) : (
                  t("pqrsTimeline.createdInitial", { status: t(`pqrsStatus.${log.toStatus}`) })
                )}
              </p>
              {log.comment ? <p className="mt-1 italic text-muted-foreground">"{log.comment}"</p> : null}
              {log.attachmentUrl ? <AttachmentPreview url={log.attachmentUrl} label={t("pqrsTimeline.viewAttachment")} /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
