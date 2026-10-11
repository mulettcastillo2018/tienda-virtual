"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

/** Una página de un listado del panel con sus filtros. Cada cambio de filtros
 *  vuelve a pedirla; si llega tarde la respuesta de filtros anteriores, se descarta. */
export function usePagedList<T>(path: string, params: Record<string, string | number | undefined>, errorMessage: string) {
  const token = useAuthStore((state) => state.token);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) => (value === undefined || value === "" ? [] : [[key, String(value)]]))
  ).toString();

  useEffect(() => {
    if (!token) return;
    let stale = false;
    apiFetch<T>(`${path}?${query}`, { token })
      .then((result) => {
        if (stale) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!stale) setError(err instanceof ApiError ? err.message : errorMessage);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, path, query, reloadKey]);

  return { data, error, reload: () => setReloadKey((key) => key + 1) };
}
