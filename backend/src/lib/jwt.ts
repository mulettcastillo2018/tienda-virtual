import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: string;
  role: "ADMIN" | "JURIDICO" | "CUSTOMER";
  // Versión de sesión del usuario al emitir el token (ver User.tokenVersion).
  // Los tokens de antes de existir no la traen: cuentan como versión 0.
  tv?: number;
}

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET no configurado");
  return value;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), {
    algorithm: "HS256",
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as jwt.SignOptions["expiresIn"],
  });
}

// Token de sesión para un usuario, con su versión de sesión actual.
export function tokenFor(user: { id: string; role: JwtPayload["role"]; tokenVersion: number }): string {
  return signToken({ userId: user.id, role: user.role, tv: user.tokenVersion });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret(), { algorithms: ["HS256"] }) as JwtPayload;
}
