import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { tokenFor } from "../lib/jwt";
import { catchAsync } from "../lib/catchAsync";
import { clientIp, createRateLimiter, limitRequests } from "../lib/rateLimit";
import { findOrCreateOAuthUser, issueLoginCode, OAuthLoginError, redeemLoginCode } from "../services/oauth.service";

export const oauthRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isFacebookConfigured() {
  return Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET);
}

oauthRouter.get(
  "/oauth-status",
  catchAsync(async (_req, res) => {
    res.json({ google: isGoogleConfigured(), facebook: isFacebookConfigured() });
  })
);

// --- Protección del ida y vuelta (parámetro state) ---
// Al salir hacia Google/Facebook se guarda un valor aleatorio en una cookie
// de este dominio y se envía como `state`; al volver deben coincidir. Así
// nadie puede hacer que otra persona termine con la sesión iniciada en la
// cuenta del atacante (CSRF de inicio de sesión).
const STATE_COOKIE = "oauth_state";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: BACKEND_URL.startsWith("https://"),
  path: "/auth",
};

function newState(res: Response): string {
  const state = crypto.randomBytes(24).toString("hex");
  res.cookie(STATE_COOKIE, state, { ...cookieOptions, maxAge: 10 * 60_000 });
  return state;
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function stateIsValid(req: Request, res: Response): boolean {
  const expected = readCookie(req, STATE_COOKIE);
  const received = typeof req.query.state === "string" ? req.query.state : "";
  res.clearCookie(STATE_COOKIE, cookieOptions);
  if (!expected || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

// El navegador vuelve con un código de un solo uso (no con el token).
async function redirectWithLogin(res: Response, userId: string) {
  const code = await issueLoginCode(userId);
  res.redirect(`${FRONTEND_URL}/oauth-callback?code=${code}`);
}

function redirectWithError(res: Response, message: string) {
  res.redirect(`${FRONTEND_URL}/login?oauthError=${encodeURIComponent(message)}`);
}

async function finishLogin(res: Response, provider: "google" | "facebook", providerId: string, email: string) {
  try {
    const user = await findOrCreateOAuthUser(provider, providerId, email);
    if (!user.isActive) {
      redirectWithError(res, "Esta cuenta está desactivada.");
      return;
    }
    await redirectWithLogin(res, user.id);
  } catch (err) {
    if (err instanceof OAuthLoginError) {
      redirectWithError(res, err.message);
      return;
    }
    throw err;
  }
}

// --- Google ---

oauthRouter.get("/google", (_req, res) => {
  if (!isGoogleConfigured()) {
    redirectWithError(res, "El inicio de sesión con Google todavía no está configurado.");
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${BACKEND_URL}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state: newState(res),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

oauthRouter.get(
  "/google/callback",
  catchAsync(async (req, res) => {
    if (!isGoogleConfigured()) {
      redirectWithError(res, "El inicio de sesión con Google todavía no está configurado.");
      return;
    }
    if (!stateIsValid(req, res)) {
      redirectWithError(res, "El inicio de sesión con Google no es válido o tardó demasiado. Intenta de nuevo.");
      return;
    }
    const code = req.query.code as string | undefined;
    if (!code) {
      redirectWithError(res, "Cancelaste el inicio de sesión con Google.");
      return;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${BACKEND_URL}/auth/google/callback`,
        grant_type: "authorization_code",
        code,
      }),
    });
    if (!tokenRes.ok) {
      redirectWithError(res, "No se pudo validar la sesión de Google.");
      return;
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!profileRes.ok) {
      redirectWithError(res, "No se pudo leer tu perfil de Google.");
      return;
    }
    const profile = (await profileRes.json()) as { sub?: string; email?: string; email_verified?: boolean };
    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      redirectWithError(res, "Tu cuenta de Google no tiene un correo verificado. Usa otro método de ingreso.");
      return;
    }

    await finishLogin(res, "google", profile.sub, profile.email);
  })
);

// --- Facebook ---

oauthRouter.get("/facebook", (_req, res) => {
  if (!isFacebookConfigured()) {
    redirectWithError(res, "El inicio de sesión con Facebook todavía no está configurado.");
    return;
  }
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID!,
    redirect_uri: `${BACKEND_URL}/auth/facebook/callback`,
    scope: "email public_profile",
    state: newState(res),
  });
  res.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params}`);
});

oauthRouter.get(
  "/facebook/callback",
  catchAsync(async (req, res) => {
    if (!isFacebookConfigured()) {
      redirectWithError(res, "El inicio de sesión con Facebook todavía no está configurado.");
      return;
    }
    if (!stateIsValid(req, res)) {
      redirectWithError(res, "El inicio de sesión con Facebook no es válido o tardó demasiado. Intenta de nuevo.");
      return;
    }
    const code = req.query.code as string | undefined;
    if (!code) {
      redirectWithError(res, "Cancelaste el inicio de sesión con Facebook.");
      return;
    }

    const tokenParams = new URLSearchParams({
      client_id: process.env.FACEBOOK_CLIENT_ID!,
      client_secret: process.env.FACEBOOK_CLIENT_SECRET!,
      redirect_uri: `${BACKEND_URL}/auth/facebook/callback`,
      code,
    });
    const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams}`);
    if (!tokenRes.ok) {
      redirectWithError(res, "No se pudo validar la sesión de Facebook.");
      return;
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const profileRes = await fetch(`https://graph.facebook.com/me?fields=id,email&access_token=${encodeURIComponent(access_token)}`);
    const profile = (await profileRes.json()) as { id?: string; email?: string };
    if (!profile.id || !profile.email) {
      redirectWithError(res, "Tu cuenta de Facebook no tiene un correo asociado. Usa otro método de ingreso.");
      return;
    }

    await finishLogin(res, "facebook", profile.id, profile.email);
  })
);

// El frontend canjea aquí el código con el que volvió el navegador.
const exchangesByIp = createRateLimiter(30, 15 * 60_000);
const exchangeSchema = z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) });

oauthRouter.post(
  "/oauth/exchange",
  limitRequests(exchangesByIp, clientIp, "Demasiados intentos. Espera unos minutos."),
  catchAsync(async (req, res) => {
    const parsed = exchangeSchema.safeParse(req.body);
    const user = parsed.success ? await redeemLoginCode(parsed.data.code) : null;
    if (!user) {
      res.status(400).json({ error: "El enlace de inicio de sesión no es válido o ya se usó. Intenta de nuevo." });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: "Esta cuenta está desactivada." });
      return;
    }
    res.json({ token: tokenFor(user), user: { id: user.id, email: user.email, role: user.role } });
  })
);
