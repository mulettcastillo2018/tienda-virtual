import { useAuthStore } from "@/store/auth.store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Un 401 a una petición con sesión significa que el servidor la cerró (cuenta
// desactivada, permisos o contraseña cambiados, token vencido): se cierra aquí
// también y se vuelve al login con el motivo, en vez de dejar cada pantalla
// mostrando errores sueltos.
function endSession(message: string) {
  if (typeof window === "undefined") return;
  useAuthStore.getState().logout();
  window.location.replace(`/login?aviso=${encodeURIComponent(message)}`);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.toString() ?? `Error ${res.status}`;
    if (res.status === 401 && token) endSession(message);
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function uploadFile<T>(path: string, file: File, token: string | null): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error?.toString() ?? `Error ${res.status}`;
    if (res.status === 401 && token) endSession(message);
    throw new ApiError(message, res.status);
  }

  return res.json();
}
