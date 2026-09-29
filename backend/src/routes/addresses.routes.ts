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

addressesRouter.put(
  "/:id",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = addressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const existing = await prisma.shippingAddress.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "Dirección no encontrada" });
      return;
    }

    const { id: _existingId, userId: _userId, createdAt, updatedAt, ...previousData } = existing;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.addressChangeLog.create({
        data: {
          addressId: existing.id,
          previousData,
          newData: parsed.data,
        },
      });
      return tx.shippingAddress.update({
        where: { id: existing.id },
        data: parsed.data,
      });
    });

    res.json(updated);
  })
);

addressesRouter.get(
  "/:id/history",
  requireAuth,
  catchAsync(async (req, res) => {
    const address = await prisma.shippingAddress.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!address) {
      res.status(404).json({ error: "Dirección no encontrada" });
      return;
    }
    const history = await prisma.addressChangeLog.findMany({
      where: { addressId: address.id },
      orderBy: { changedAt: "desc" },
    });
    res.json(history);
  })
);
