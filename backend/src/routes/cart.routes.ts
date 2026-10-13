import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { withPublicImages } from "../services/storage";
import { touchCart } from "../services/cartReminder.service";

export const cartRouter = Router();

// Tope por producto: evita pedidos absurdos por un error de dedo.
export const MAX_PER_PRODUCT = 99;

async function getOrCreateCart(userId: string) {
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (cart) return cart;
  return prisma.cart.create({ data: { userId } });
}

// El carrito no reserva inventario: un producto puede desactivarse o agotarse
// mientras espera ahí. Cada línea dice si se puede comprar tal como está.
type CartIssue = "INACTIVE" | "OUT_OF_STOCK" | "NOT_ENOUGH_STOCK";

function cartIssue(product: { isActive: boolean; stock: number }, quantity: number): CartIssue | null {
  if (!product.isActive) return "INACTIVE";
  if (product.stock <= 0) return "OUT_OF_STOCK";
  if (product.stock < quantity) return "NOT_ENOUGH_STOCK";
  return null;
}

// Por qué no se puede llevar esa cantidad, o null si se puede.
function quantityError(product: { name: string; stock: number }, quantity: number, inCart = 0) {
  if (quantity > MAX_PER_PRODUCT) return `Puedes llevar máximo ${MAX_PER_PRODUCT} unidades de "${product.name}".`;
  if (product.stock <= 0) return `"${product.name}" está agotado.`;
  if (quantity > product.stock) {
    return inCart > 0
      ? `Solo quedan ${product.stock} unidades de "${product.name}" y ya tienes ${inCart} en el carrito.`
      : `Solo quedan ${product.stock} unidades de "${product.name}".`;
  }
  return null;
}

const UNAVAILABLE = "Este producto ya no está disponible.";
const NOT_IN_CART = "Ese producto no está en tu carrito.";

cartRouter.get(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const cart = await getOrCreateCart(req.user!.userId);
    const items = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: { product: true },
      orderBy: { id: "asc" },
    });
    res.json({
      id: cart.id,
      items: items.map((item) => ({ ...item, product: withPublicImages(item.product), issue: cartIssue(item.product, item.quantity) })),
    });
  })
);

const addItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().max(MAX_PER_PRODUCT).default(1),
});

cartRouter.post(
  "/items",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const cart = await getOrCreateCart(req.user!.userId);
    const { productId, quantity } = parsed.data;

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, stock: true, isActive: true } });
    if (!product || !product.isActive) {
      res.status(404).json({ error: UNAVAILABLE });
      return;
    }
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } },
      select: { quantity: true },
    });
    const inCart = existing?.quantity ?? 0;
    const error = quantityError(product, inCart + quantity, inCart);
    if (error) {
      res.status(409).json({ error });
      return;
    }

    const item = await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: cart.id, productId } },
      create: { cartId: cart.id, productId, quantity },
      update: { quantity: { increment: quantity } },
    });
    await touchCart(prisma, cart.id);
    res.status(201).json(item);
  })
);

const updateItemSchema = z.object({ quantity: z.number().int().min(1).max(MAX_PER_PRODUCT) });

cartRouter.put(
  "/items/:productId",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const cart = await getOrCreateCart(req.user!.userId);
    const where = { cartId_productId: { cartId: cart.id, productId: req.params.productId } };
    const current = await prisma.cartItem.findUnique({ where, include: { product: { select: { name: true, stock: true, isActive: true } } } });
    if (!current) {
      res.status(404).json({ error: NOT_IN_CART });
      return;
    }
    // Bajar la cantidad siempre se puede (acerca la línea a lo disponible);
    // subirla exige que el producto siga a la venta y alcance.
    if (parsed.data.quantity > current.quantity) {
      if (!current.product.isActive) {
        res.status(404).json({ error: UNAVAILABLE });
        return;
      }
      const error = quantityError(current.product, parsed.data.quantity);
      if (error) {
        res.status(409).json({ error });
        return;
      }
    }
    const item = await prisma.cartItem.update({ where, data: { quantity: parsed.data.quantity } });
    await touchCart(prisma, cart.id);
    res.json(item);
  })
);

cartRouter.delete(
  "/",
  requireAuth,
  catchAsync(async (req, res) => {
    const cart = await getOrCreateCart(req.user!.userId);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await touchCart(prisma, cart.id);
    res.status(204).send();
  })
);

cartRouter.delete(
  "/items/:productId",
  requireAuth,
  catchAsync(async (req, res) => {
    const cart = await getOrCreateCart(req.user!.userId);
    const { count } = await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId: req.params.productId } });
    if (count === 0) {
      res.status(404).json({ error: NOT_IN_CART });
      return;
    }
    await touchCart(prisma, cart.id);
    res.status(204).send();
  })
);

// --- Carrito de invitado: vive en el navegador hasta que compra o inicia sesión ---

const guestItemsSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(MAX_PER_PRODUCT) })).max(50),
});

// El carrito del navegador con los productos al día y los mismos avisos que el
// de una cuenta. Los productos que ya no existen se omiten.
cartRouter.post(
  "/guest",
  catchAsync(async (req, res) => {
    const parsed = guestItemsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const products = await prisma.product.findMany({ where: { id: { in: parsed.data.items.map((item) => item.productId) } } });
    const byId = new Map(products.map((product) => [product.id, product]));
    const items = parsed.data.items.flatMap(({ productId, quantity }) => {
      const product = byId.get(productId);
      return product ? [{ id: productId, cartId: "guest", productId, quantity, product: withPublicImages(product), issue: cartIssue(product, quantity) }] : [];
    });
    res.json({ id: "guest", items });
  })
);

const guestCheckSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().max(MAX_PER_PRODUCT).default(1),
  inCart: z.number().int().min(0).max(MAX_PER_PRODUCT).default(0),
});

// Antes de sumar al carrito del navegador: el producto sigue a la venta y
// alcanza para lo que ya tiene más lo que agrega (las mismas reglas que /items).
cartRouter.post(
  "/guest/check",
  catchAsync(async (req, res) => {
    const parsed = guestCheckSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { productId, quantity, inCart } = parsed.data;
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, stock: true, isActive: true } });
    if (!product || !product.isActive) {
      res.status(404).json({ error: UNAVAILABLE });
      return;
    }
    const error = quantityError(product, inCart + quantity, inCart);
    if (error) {
      res.status(409).json({ error });
      return;
    }
    res.json({ ok: true });
  })
);
