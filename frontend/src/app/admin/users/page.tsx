"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import type { UserRole } from "@/lib/types";
import { FilterTabs } from "@/components/ui/FilterTabs";
import { Pagination } from "@/components/ui/Pagination";
import { SearchForm } from "@/components/ui/SearchForm";

interface AdminUser {
  id: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  _count: { orders: number };
}

const ROLES: UserRole[] = ["CUSTOMER", "JURIDICO", "ADMIN"];
const PAGE_SIZE = 20;

function formatDate(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "long" }).format(new Date(iso));
}

export default function AdminUsersPage() {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const [roleFilter, setRoleFilter] = useState<UserRole | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const locale = useLocale();

  const list = usePagedList<{ items: AdminUser[]; total: number }>(
    "/users",
    { page, pageSize: PAGE_SIZE, role: roleFilter === "ALL" ? undefined : roleFilter, q: query },
    t("adminUsers.loadError")
  );
  const users = list.data?.items ?? [];

  async function handleChangeRole(user: AdminUser, role: UserRole) {
    if (!token || role === user.role) return;
    if (!confirm(t("adminUsers.changeRoleConfirm", { email: user.email, role: t(`userRole.${role}`) }))) return;

    setError(null);
    setUpdatingId(user.id);
    try {
      await apiFetch(`/users/${user.id}/role`, { method: "PUT", token, body: JSON.stringify({ role }) });
      list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminUsers.changeRoleError"));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleActive(user: AdminUser) {
    if (!token) return;
    const nextActive = !user.isActive;
    const confirmMessage = nextActive
      ? t("adminUsers.reactivateConfirm", { email: user.email })
      : t("adminUsers.deactivateConfirm", { email: user.email });
    if (!confirm(confirmMessage)) return;

    setError(null);
    setUpdatingId(user.id);
    try {
      await apiFetch(`/users/${user.id}/active`, {
        method: "PUT",
        token,
        body: JSON.stringify({ isActive: nextActive }),
      });
      list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("adminUsers.toggleActiveError"));
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleResetPassword(userId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const form = event.currentTarget;
    const field = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
    const newPassword = field("newPassword");
    const confirmPassword = field("confirmPassword");

    if (newPassword !== confirmPassword) {
      setResetError(t("adminUsers.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setResetError(t("adminUsers.passwordTooShort"));
      return;
    }

    setResetError(null);
    setUpdatingId(userId);
    try {
      await apiFetch(`/users/${userId}/password`, {
        method: "PUT",
        token,
        body: JSON.stringify({ newPassword }),
      });
      setResettingId(null);
      showToast(t("adminUsers.resetSuccessToast"));
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : t("adminUsers.resetError"));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="space-y-4 pb-2">
        <FilterTabs
          options={[{ value: "ALL" as const, label: t("adminUsers.allRoles") }, ...ROLES.map((value) => ({ value, label: t(`userRole.${value}`) }))]}
          value={roleFilter}
          onChange={(value) => {
            setRoleFilter(value);
            setPage(1);
          }}
        />
        <SearchForm
          placeholder={t("adminUsers.searchPlaceholder")}
          onSearch={(value) => {
            setQuery(value);
            setPage(1);
          }}
        />
      </div>
      {error || list.error ? <p className="text-sm text-peligro font-medium">{error ?? list.error}</p> : null}
      {list.data && users.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("adminUsers.empty")}</p>
      ) : null}

      {users.map((user) => (
        <div key={user.id} className="rounded-2xl border border-border p-3 bg-surface shadow-suave">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                {user.email} {!user.isActive ? <span className="text-peligro">{t("adminUsers.deactivated")}</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                {user.phone} · {t("adminUsers.ordersCount", { count: user._count.orders, plural: user._count.orders === 1 ? "" : "s" })} ·{" "}
                {t("adminUsers.since", { date: formatDate(user.createdAt, locale) })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setResetError(null);
                  setResettingId(resettingId === user.id ? null : user.id);
                }}
                className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                {t("adminUsers.resetPassword")}
              </button>
              {user.id === currentUser?.id ? (
                <span className="text-xs text-muted-foreground">{t("adminUsers.you")}</span>
              ) : (
                <>
                  <select
                    value={user.role}
                    onChange={(e) => handleChangeRole(user, e.target.value as UserRole)}
                    disabled={updatingId === user.id}
                    className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`userRole.${role}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleToggleActive(user)}
                    disabled={updatingId === user.id}
                    className="text-sm font-semibold text-peligro disabled:opacity-50"
                  >
                    {user.isActive ? t("adminUsers.deactivate") : t("adminUsers.reactivate")}
                  </button>
                </>
              )}
            </div>
          </div>

          {resettingId === user.id ? (
            <form
              onSubmit={(e) => handleResetPassword(user.id, e)}
              className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
            >
              {resetError ? <p className="w-full text-sm text-peligro font-medium">{resetError}</p> : null}
              <input
                type="password"
                name="newPassword"
                placeholder={t("adminUsers.newPassword")}
                required
                minLength={8}
                className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface"
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder={t("adminUsers.confirmPassword")}
                required
                minLength={8}
                className="rounded-xl border border-border px-2.5 h-9 text-sm bg-surface"
              />
              <button
                type="submit"
                disabled={updatingId === user.id}
                className="inline-flex items-center justify-center bg-foreground font-semibold text-background shadow-suave transition-[translate,box-shadow] duration-200 hover:-translate-y-px hover:shadow-elevada rounded-full px-4 h-9 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("adminUsers.save")}
              </button>
              <button
                type="button"
                onClick={() => setResettingId(null)}
                className="rounded-full border border-border px-4 h-9 text-sm text-muted-foreground inline-flex items-center justify-center bg-surface font-medium transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {t("adminUsers.cancel")}
              </button>
            </form>
          ) : null}
        </div>
      ))}
      <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onChange={setPage} />
    </div>
  );
}
