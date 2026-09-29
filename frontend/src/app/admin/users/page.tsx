"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { useToastStore } from "@/store/toast.store";
import { useT, useLocale } from "@/lib/i18n";
import type { UserRole } from "@/lib/types";

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

function formatDate(iso: string, locale: "es" | "en") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CO", { dateStyle: "long" }).format(new Date(iso));
}

export default function AdminUsersPage() {
  const token = useAuthStore((state) => state.token);
  const currentUser = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.show);
  const t = useT();
  const locale = useLocale();

  async function loadUsers() {
    if (!token) return;
    const data = await apiFetch<AdminUser[]>("/users", { token });
    setUsers(data);
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleChangeRole(user: AdminUser, role: UserRole) {
    if (!token || role === user.role) return;
    if (!confirm(t("adminUsers.changeRoleConfirm", { email: user.email, role: t(`userRole.${role}`) }))) return;

    setError(null);
    setUpdatingId(user.id);
    try {
      await apiFetch(`/users/${user.id}/role`, { method: "PUT", token, body: JSON.stringify({ role }) });
      await loadUsers();
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
      await loadUsers();
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {users.map((user) => (
        <div key={user.id} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">
                {user.email} {!user.isActive ? <span className="text-red-600">{t("adminUsers.deactivated")}</span> : null}
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
                className="text-sm font-semibold text-accent"
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
                    className="rounded-lg border border-border px-2 py-1 text-sm"
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
                    className="text-sm font-semibold text-red-600 disabled:opacity-50"
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
              {resetError ? <p className="w-full text-sm text-red-600">{resetError}</p> : null}
              <input
                type="password"
                name="newPassword"
                placeholder={t("adminUsers.newPassword")}
                required
                minLength={8}
                className="rounded-lg border border-border px-2 py-1 text-sm"
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder={t("adminUsers.confirmPassword")}
                required
                minLength={8}
                className="rounded-lg border border-border px-2 py-1 text-sm"
              />
              <button
                type="submit"
                disabled={updatingId === user.id}
                className="btn-primary rounded-full px-4 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("adminUsers.save")}
              </button>
              <button
                type="button"
                onClick={() => setResettingId(null)}
                className="rounded-full border border-border px-4 py-1 text-sm text-muted-foreground"
              >
                {t("adminUsers.cancel")}
              </button>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}
