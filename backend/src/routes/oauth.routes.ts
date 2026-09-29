import { Router } from "express";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { catchAsync } from "../lib/catchAsync";

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

// Crea o reutiliza el usuario asociado a una cuenta social, y emite nuestro propio
// JWT — el resto de la aplicación no necesita saber si alguien entró con
// correo/contraseña o con Google/Facebook, solo ve el mismo token de siempre.
async function findOrCreateOAuthUser(provider: "google" | "facebook", providerId: string, email: string) {
  let user = await prisma.user.findUnique({ where: { provider_providerId: { provider, providerId } } });
  if (user) return user;

  // Si ya existe una cuenta tradicional con ese correo, la vinculamos en vez de
  // crear un duplicado.
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    user = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { provider, providerId },
    });
    return user;
  }

  user = await prisma.user.create({ data: { email, provider, providerId } });
  await prisma.cart.create({ data: { userId: user.id } });
  return user;
}

function redirectWithToken(res: import("express").Response, token: string) {
  res.redirect(`${FRONTEND_URL}/oauth-callback?token=${encodeURIComponent(token)}`);
}

function redirectWithError(res: import("express").Response, message: string) {
  res.redirect(`${FRONTEND_URL}/login?oauthError=${encodeURIComponent(message)}`);
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
    access_type: "offline",
    prompt: "select_account",
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
    const code = req.query.code as string | undefined;
    if (!code) {
      redirectWithError(res, "Google no envió un código de autorización.");
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
    const profile = (await profileRes.json()) as { sub: string; email: string };

    const user = await findOrCreateOAuthUser("google", profile.sub, profile.email);
    if (!user.isActive) {
      redirectWithError(res, "Esta cuenta está desactivada.");
      return;
    }
    const token = signToken({ userId: user.id, role: user.role });
    redirectWithToken(res, token);
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
    const code = req.query.code as string | undefined;
    if (!code) {
      redirectWithError(res, "Facebook no envió un código de autorización.");
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

    const profileRes = await fetch(
      `https://graph.facebook.com/me?fields=id,email&access_token=${access_token}`
    );
    const profile = (await profileRes.json()) as { id: string; email?: string };
    if (!profile.email) {
      redirectWithError(res, "Tu cuenta de Facebook no tiene un correo asociado. Usa otro método de ingreso.");
      return;
    }

    const user = await findOrCreateOAuthUser("facebook", profile.id, profile.email);
    if (!user.isActive) {
      redirectWithError(res, "Esta cuenta está desactivada.");
      return;
    }
    const token = signToken({ userId: user.id, role: user.role });
    redirectWithToken(res, token);
  })
);
