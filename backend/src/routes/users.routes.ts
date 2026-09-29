import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { forgetUserState } from "../lib/userState";

export const usersRouter = Router();

usersRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    });
    res.json(users);
  })
);

const roleSchema = z.object({
  role: z.enum(["ADMIN", "JURIDICO", "CUSTOMER"]),
});

usersRouter.put(
  "/:id/role",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: "No puedes cambiar tu propio rol." });
      return;
    }

    // Con otro rol, sus sesiones abiertas dejan de servir de inmediato.
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: parsed.data.role, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, role: true, createdAt: true },
    });
    forgetUserState(user.id);
    res.json(user);
  })
);

const activeSchema = z.object({
  isActive: z.boolean(),
});

usersRouter.put(
  "/:id/active",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = activeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: "No puedes desactivar tu propia cuenta." });
      return;
    }

    // Desactivar cierra sus sesiones abiertas de inmediato.
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: parsed.data.isActive, ...(parsed.data.isActive ? {} : { tokenVersion: { increment: 1 } }) },
      select: { id: true, email: true, role: true, isActive: true },
    });
    forgetUserState(user.id);
    res.json(user);
  })
);

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

usersRouter.put(
  "/:id/password",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    // La contraseña nueva cierra las sesiones que tenía abiertas.
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    forgetUserState(req.params.id);
    res.json({ ok: true });
  })
);
