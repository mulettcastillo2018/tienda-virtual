import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";

export const cartRouter = Router();

async function getOrCreateCart(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) return cart;
  return prisma.cart.create({ data: { userId } });
}

cartRouter.get("/", requireAuth, async (req, res) => {
  const cart = await getOrCreateCart(req.user!.userId);
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: { product: true },
  });
  res.json({ id: cart.id, items });
});

const addItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().default(1),
});

cartRouter.post("/items", requireAuth, async (req, res) => {
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const cart = await getOrCreateCart(req.user!.userId);
  const { productId, quantity } = parsed.data;

  const item = await prisma.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    create: { cartId: cart.id, productId, quantity },
    update: { quantity: { increment: quantity } },
  });
  res.status(201).json(item);
});

const updateItemSchema = z.object({ quantity: z.number().int().min(1) });

cartRouter.put("/items/:productId", requireAuth, async (req, res) => {
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const cart = await getOrCreateCart(req.user!.userId);
  const item = await prisma.cartItem.update({
    where: { cartId_productId: { cartId: cart.id, productId: req.params.productId } },
    data: { quantity: parsed.data.quantity },
  });
  res.json(item);
});

cartRouter.delete("/items/:productId", requireAuth, async (req, res) => {
  const cart = await getOrCreateCart(req.user!.userId);
  await prisma.cartItem.delete({
    where: { cartId_productId: { cartId: cart.id, productId: req.params.productId } },
  });
  res.status(204).send();
});
