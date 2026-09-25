import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";

export const addressesRouter = Router();

addressesRouter.get(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const addresses = await prisma.shippingAddress.findMany({
      where: { userId: req.user!.userId },
    });
    res.json(addresses);
  })
);

const addressSchema = z.object({
  fullName: z.string().trim().min(1),
  addressLine1: z.string().trim().min(1),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postalCode: z.string().trim().min(1),
  country: z.string().trim().default("CO"),
  phone: z.string().trim().min(1),
});

addressesRouter.post(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const address = await prisma.shippingAddress.create({
      data: { ...parsed.data, userId: req.user!.userId },
    });
    res.status(201).json(address);
  })
);
