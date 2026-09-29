import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { tokenFor } from "../lib/jwt";
import { catchAsync } from "../lib/catchAsync";
import { clientIp, createRateLimiter, limitRequests } from "../lib/rateLimit";
import { forgetUserState, revokeSessions } from "../lib/userState";
import { requireAuth } from "../middleware/auth.middleware";
import { sendPasswordResetEmail } from "../services/email.service";

export const authRouter = Router();

// Contra adivinar contraseñas: intentos fallidos por correo (el ataque típico
// a una cuenta) y, con un margen amplio, por IP (muchas cuentas desde el mismo
// origen; amplio porque una red corporativa o un café comparten IP).
const failedLoginsByEmail = createRateLimiter(8, 15 * 60_000);
const failedLoginsByIp = createRateLimiter(100, 15 * 60_000);
const registrationsByIp = createRateLimiter(20, 60 * 60_000);
// Cada solicitud envía un correo: tope por destinatario (no llenarle el buzón
// a nadie) y por IP (no gastar la cuota de envíos).
const resetEmailsByAddress = createRateLimiter(3, 60 * 60_000);
const resetRequestsByIp = createRateLimiter(10, 60 * 60_000);
const resetAttemptsByIp = createRateLimiter(30, 60 * 60_000);
const failedPasswordChangesByUser = createRateLimiter(10, 60 * 60_000);

const TOO_MANY_LOGINS = "Demasiados intentos fallidos. Espera 15 minutos o recupera tu contraseña.";

function sessionUser(user: { id: string; email: string; role: string }) {
  return { id: user.id, email: user.email, role: user.role };
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7, "Ingresa un teléfono de contacto válido"),
  password: z.string().min(8),
});

authRouter.post(
  "/register",
  limitRequests(registrationsByIp, clientIp, "Demasiados registros desde esta conexión. Intenta más tarde."),
  catchAsync(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, phone, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Ya existe una cuenta con ese correo" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, phone, passwordHash },
    });
    await prisma.cart.create({ data: { userId: user.id } });

    res.status(201).json({ token: tokenFor(user), user: sessionUser(user) });
  })
);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  catchAsync(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, password } = parsed.data;
    const ip = clientIp(req);
    if (failedLoginsByEmail.exceeded(email) || failedLoginsByIp.exceeded(ip)) {
      res.status(429).json({ error: TOO_MANY_LOGINS });
      return;
    }
    const failed = () => {
      failedLoginsByEmail.hit(email);
      failedLoginsByIp.hit(ip);
    };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      failed();
      res.status(401).json({
        error: user?.provider
          ? `Esta cuenta usa inicio de sesión con ${user.provider === "google" ? "Google" : "Facebook"}.`
          : "Correo o contraseña incorrectos",
      });
      return;
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      failed();
      res.status(401).json({ error: "Correo o contraseña incorrectos" });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: "Esta cuenta está desactivada. Contacta al administrador." });
      return;
    }
    failedLoginsByEmail.reset(email);

    res.json({ token: tokenFor(user), user: sessionUser(user) });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  catchAsync(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, phone: true, provider: true, role: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    res.json(user);
  })
);

const profileSchema = z.object({
  phone: z.string().trim().min(7, "Ingresa un teléfono de contacto válido"),
});

authRouter.put(
  "/profile",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { phone: parsed.data.phone },
      select: { id: true, email: true, phone: true, role: true, createdAt: true },
    });
    res.json(user);
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// Cambiar la contraseña cierra las demás sesiones (si alguien más la conocía,
// queda por fuera); esta sesión sigue con el token nuevo que se devuelve.
authRouter.put(
  "/password",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const userId = req.user!.userId;
    if (failedPasswordChangesByUser.exceeded(userId)) {
      res.status(429).json({ error: "Demasiados intentos. Espera una hora o recupera tu contraseña por correo." });
      return;
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash) {
      res.status(400).json({ error: "Esta cuenta inició sesión con Google/Facebook y no tiene contraseña." });
      return;
    }
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      failedPasswordChangesByUser.hit(userId);
      res.status(401).json({ error: "La contraseña actual no es correcta" });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    const tokenVersion = await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      return revokeSessions(user.id, tx);
    });
    forgetUserState(user.id);
    res.json({ ok: true, token: tokenFor({ ...user, tokenVersion }) });
  })
);

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

authRouter.post(
  "/forgot-password",
  limitRequests(resetRequestsByIp, clientIp, "Demasiadas solicitudes desde esta conexión. Intenta más tarde."),
  catchAsync(async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email;
    const user = await prisma.user.findUnique({ where: { email } });

    // Pasado el tope por correo no se envía nada más, pero la respuesta es la
    // misma: no revela si el correo existe ni si ya se le enviaron.
    if (user && !resetEmailsByAddress.exceeded(email)) {
      resetEmailsByAddress.hit(email);
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
        prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
      ]);

      const resetUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail(user.email, resetUrl);
    }

    res.json({ ok: true });
  })
);

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

// Restablecer la contraseña cierra todas las sesiones abiertas.
authRouter.post(
  "/reset-password",
  limitRequests(resetAttemptsByIp, clientIp, "Demasiados intentos desde esta conexión. Intenta más tarde."),
  catchAsync(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      res.status(400).json({ error: "El enlace no es válido o expiró. Solicita uno nuevo." });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    const used = await prisma.$transaction(async (tx) => {
      // Un enlace sirve una sola vez, aunque llegue dos veces a la vez.
      const marked = await tx.passwordResetToken.updateMany({ where: { id: resetToken.id, usedAt: null }, data: { usedAt: new Date() } });
      if (marked.count === 0) return false;
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await revokeSessions(resetToken.userId, tx);
      return true;
    });
    if (!used) {
      res.status(400).json({ error: "El enlace no es válido o expiró. Solicita uno nuevo." });
      return;
    }
    forgetUserState(resetToken.userId);

    res.json({ ok: true });
  })
);
