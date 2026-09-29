import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { catchAsync } from "../lib/catchAsync";
import { requireAuth } from "../middleware/auth.middleware";
import { sendPasswordResetEmail } from "../services/email.service";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().email(),
  phone: z.string().trim().min(7, "Ingresa un teléfono de contacto válido"),
  password: z.string().min(8),
});

authRouter.post("/register", catchAsync(async (req, res) => {
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

  const token = signToken({ userId: user.id, role: user.role });
  res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
}));

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

authRouter.post("/login", catchAsync(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) {
    res.status(401).json({
      error: user?.provider
        ? `Esta cuenta usa inicio de sesión con ${user.provider === "google" ? "Google" : "Facebook"}.`
        : "Correo o contraseña incorrectos",
    });
    return;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Correo o contraseña incorrectos" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Esta cuenta está desactivada. Contacta al administrador." });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}));

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

authRouter.put(
  "/password",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
    if (!user.passwordHash) {
      res.status(400).json({ error: "Esta cuenta inició sesión con Google/Facebook y no tiene contraseña." });
      return;
    }
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "La contraseña actual no es correcta" });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ ok: true });
  })
);

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

authRouter.post(
  "/forgot-password",
  catchAsync(async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    if (user) {
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

    // Respuesta genérica siempre: no revela si el correo existe en el sistema.
    res.json({ ok: true });
  })
);

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post(
  "/reset-password",
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
    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    res.json({ ok: true });
  })
);
