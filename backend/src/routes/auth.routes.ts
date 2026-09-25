import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../lib/jwt";
import { catchAsync } from "../lib/catchAsync";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

authRouter.post("/register", catchAsync(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Ya existe una cuenta con ese correo" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash },
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
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Correo o contraseña incorrectos" });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
}));
