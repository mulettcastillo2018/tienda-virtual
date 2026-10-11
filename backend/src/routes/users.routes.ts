import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { pageArgs, pageQuery } from "../lib/pagination";
import { forgetUserState } from "../lib/userState";

export const usersRouter = Router();

const listSchema = z.object({
  ...pageQuery,
  role: z.enum(["ADMIN", "JURIDICO", "CUSTOMER"]).optional(),
  q: z.string().trim().max(100).optional(),
});

// Usuarios de a una página, por rol y buscados por correo o teléfono.
usersRouter.get(
  "/",
  requireAuth,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { page, pageSize, role, q } = parsed.data;
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...pageArgs({ page, pageSize }),
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ items: users, total, page, pageSize });
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
