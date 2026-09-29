import type { NextFunction, Request, Response } from "express";
import { verifyToken, type JwtPayload } from "../lib/jwt";
import { getUserState } from "../lib/userState";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Motivo por el que un token con firma válida ya no sirve, o null si sigue
// vigente. El token dura días, así que además de la firma se revisa el estado
// actual del usuario: desactivarlo, cambiarle el rol o la contraseña debe
// surtir efecto de inmediato, no cuando el token venza.
async function invalidReason(payload: JwtPayload): Promise<string | null> {
  const state = await getUserState(payload.userId);
  if (!state || !state.isActive) return "Tu cuenta está desactivada. Contacta al administrador.";
  if (state.role !== payload.role) return "Tus permisos cambiaron. Inicia sesión de nuevo.";
  if (state.tokenVersion !== (payload.tv ?? 0)) return "Tu sesión se cerró. Inicia sesión de nuevo.";
  return null;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  try {
    const reason = await invalidReason(payload);
    if (reason) {
      res.status(401).json({ error: reason });
      return;
    }
  } catch (err) {
    next(err);
    return;
  }

  req.user = payload;
  next();
}

// Para rutas públicas que muestran algo más a un administrador (p. ej.
// productos desactivados): true solo con un token vigente de ADMIN.
export async function isAdminRequest(req: Request): Promise<boolean> {
  const token = bearerToken(req);
  if (!token) return false;
  try {
    const payload = verifyToken(token);
    return payload.role === "ADMIN" && (await invalidReason(payload)) === null;
  } catch {
    return false;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    res.status(403).json({ error: "Requiere permisos de administrador" });
    return;
  }
  next();
}

export function requireJuridico(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "JURIDICO") {
    res.status(403).json({ error: "Requiere permisos del área jurídica" });
    return;
  }
  next();
}

export function requireAdminOrJuridico(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN" && req.user?.role !== "JURIDICO") {
    res.status(403).json({ error: "No autorizado" });
    return;
  }
  next();
}
