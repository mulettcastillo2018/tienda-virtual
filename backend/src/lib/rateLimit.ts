import type { NextFunction, Request, Response } from "express";

// Límite de eventos por clave en una ventana de tiempo deslizante, en memoria
// (suficiente para un solo servidor; con varios habría que llevarlo a algo
// compartido como Redis).
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  function recent(key: string) {
    const now = Date.now();
    const current = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (current.length === 0) hits.delete(key);
    else hits.set(key, current);
    return current;
  }

  return {
    exceeded: (key: string) => recent(key).length >= max,
    hit: (key: string) => hits.set(key, [...recent(key), Date.now()]),
    reset: (key: string) => hits.delete(key),
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export const clientIp = (req: Request) => req.ip ?? "desconocida";

// Middleware que cuenta cada petición contra la clave y responde 429 al pasar
// el límite.
export function limitRequests(limiter: RateLimiter, key: (req: Request) => string, message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const k = key(req);
    if (limiter.exceeded(k)) {
      res.status(429).json({ error: message });
      return;
    }
    limiter.hit(k);
    next();
  };
}
