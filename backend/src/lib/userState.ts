import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma";

interface UserState {
  isActive: boolean;
  role: Role;
  tokenVersion: number;
  expires: number;
}

// Se consulta en cada petición autenticada. La base de datos está en otra
// región, así que se guarda unos segundos en memoria; al desactivar, cambiar
// el rol o la contraseña se olvida de inmediato (forgetUserState), así que en
// la práctica el cambio aplica al instante en este servidor.
const TTL_MS = 30_000;
const cache = new Map<string, UserState>();

export async function getUserState(userId: string): Promise<UserState | null> {
  const cached = cache.get(userId);
  if (cached && cached.expires > Date.now()) return cached;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true, tokenVersion: true } });
  if (!user) {
    cache.delete(userId);
    return null;
  }
  const state = { ...user, expires: Date.now() + TTL_MS };
  cache.set(userId, state);
  return state;
}

export function forgetUserState(userId: string) {
  cache.delete(userId);
}

// Cierra todas las sesiones abiertas del usuario (sus tokens dejan de servir).
// Devuelve la versión nueva, para emitir un token vigente si hace falta.
// Dentro de una transacción, llama también forgetUserState después de
// confirmarla (si no, otra petición podría guardar en caché la versión vieja).
export async function revokeSessions(userId: string, tx: Prisma.TransactionClient = prisma): Promise<number> {
  const user = await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } }, select: { tokenVersion: true } });
  forgetUserState(userId);
  return user.tokenVersion;
}
