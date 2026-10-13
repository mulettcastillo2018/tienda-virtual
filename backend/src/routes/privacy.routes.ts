import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth.middleware";
import { catchAsync } from "../lib/catchAsync";
import { clientIp } from "../lib/rateLimit";
import { forgetUserState } from "../lib/userState";
import { PRIVACY_POLICY_VERSION, recordConsent } from "../lib/privacy";
import { isValidUnsubscribeToken } from "../services/cartReminder.service";

// Derechos del titular de los datos (Ley 1581 de 2012): conocer qué se
// tiene, autorizar o revocar, descargar y suprimir.
export const privacyRouter = Router();

privacyRouter.get(
  "/me",
  requireAuth,
  catchAsync(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: { privacyAcceptedAt: true, privacyVersion: true, marketingOptIn: true, passwordHash: true },
    });
    const consents = await prisma.consentRecord.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { purpose: true, granted: true, policyVersion: true, channel: true, createdAt: true },
    });
    const { passwordHash, ...rest } = user;
    res.json({
      ...rest,
      // Para pedir la contraseña al suprimir la cuenta (las de Google pueden no tenerla).
      hasPassword: Boolean(passwordHash),
      currentVersion: PRIVACY_POLICY_VERSION,
      // Cuenta anterior a la política, o una versión nueva que no ha aceptado.
      needsAcceptance: user.privacyVersion !== PRIVACY_POLICY_VERSION,
      consents,
    });
  })
);

// Acepta la versión vigente (clientes que se registraron antes de la política
// o de un cambio de versión).
privacyRouter.post(
  "/accept",
  requireAuth,
  catchAsync(async (req, res) => {
    const userId = req.user!.userId;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_POLICY_VERSION } });
      await recordConsent(tx, { userId, email: user.email, purpose: "DATA_PROCESSING", granted: true, channel: "CUENTA", ipAddress: clientIp(req) });
    });
    res.json({ ok: true, privacyVersion: PRIVACY_POLICY_VERSION });
  })
);

// Ofertas y novedades: se autorizan o se revocan aparte, cuando se quiera.
privacyRouter.put(
  "/marketing",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = z.object({ optIn: z.boolean() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const userId = req.user!.userId;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, marketingOptIn: true } });
    if (user.marketingOptIn !== parsed.data.optIn) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { marketingOptIn: parsed.data.optIn } });
        await recordConsent(tx, { userId, email: user.email, purpose: "MARKETING", granted: parsed.data.optIn, channel: "CUENTA", ipAddress: clientIp(req) });
      });
    }
    res.json({ marketingOptIn: parsed.data.optIn });
  })
);

// Baja de las ofertas y recordatorios desde el enlace del correo, sin iniciar
// sesión (lo autoriza la firma del enlace). También recibe la baja de un clic
// de los clientes de correo (RFC 8058): un POST con los datos en la URL.
privacyRouter.post(
  "/unsubscribe",
  catchAsync(async (req, res) => {
    const userId = typeof req.query.u === "string" ? req.query.u : "";
    if (!userId || !isValidUnsubscribeToken(userId, req.query.t)) {
      res.status(400).json({ error: "El enlace para darte de baja no es válido." });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, marketingOptIn: true } });
    if (user?.marketingOptIn) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { marketingOptIn: false } });
        await recordConsent(tx, { userId, email: user.email, purpose: "MARKETING", granted: false, channel: "CORREO", ipAddress: clientIp(req) });
      });
    }
    res.json({ ok: true });
  })
);

// Todos los datos personales de la cuenta, en un archivo JSON.
privacyRouter.get(
  "/export",
  requireAuth,
  catchAsync(async (req, res) => {
    const userId = req.user!.userId;
    const [user, addresses, orders, pqrs, reviews, consents] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true, phone: true, provider: true, createdAt: true, privacyAcceptedAt: true, privacyVersion: true, marketingOptIn: true },
      }),
      prisma.shippingAddress.findMany({ where: { userId }, omit: { userId: true } }),
      prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          status: true,
          totalAmount: true,
          shippingCost: true,
          paymentOption: true,
          shippingFullName: true,
          shippingLine1: true,
          shippingLine2: true,
          shippingCity: true,
          shippingState: true,
          shippingPostalCode: true,
          shippingPhone: true,
          billingIdType: true,
          billingIdNumber: true,
          billingName: true,
          items: { select: { quantity: true, priceAtPurchase: true, product: { select: { name: true } } } },
        },
      }),
      prisma.pqrs.findMany({ where: { userId }, select: { type: true, subject: true, message: true, status: true, createdAt: true, response: true } }),
      prisma.storeReview.findMany({ where: { userId }, select: { rating: true, comment: true, createdAt: true } }),
      prisma.consentRecord.findMany({ where: { userId }, select: { purpose: true, granted: true, policyVersion: true, channel: true, createdAt: true } }),
    ]);
    res.setHeader("Content-Disposition", `attachment; filename="mis-datos-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ exportedAt: new Date().toISOString(), account: user, addresses, orders, pqrs, reviews, consents });
  })
);

// Supresión: se borran los datos de la cuenta y se anonimiza el usuario. Lo
// que la ley obliga a conservar (pedidos con su dirección de entrega,
// facturas, PQRS) queda sin cuenta asociada que se pueda usar.
const deleteSchema = z.object({
  confirm: z.literal("ELIMINAR"),
  password: z.string().optional(),
});

privacyRouter.post(
  "/delete-account",
  requireAuth,
  catchAsync(async (req, res) => {
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Escribe ELIMINAR para confirmar.' });
      return;
    }
    const userId = req.user!.userId;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== "CUSTOMER") {
      res.status(409).json({ error: "Una cuenta del equipo de la tienda se da de baja desde la administración." });
      return;
    }
    if (user.passwordHash && !(parsed.data.password && (await bcrypt.compare(parsed.data.password, user.passwordHash)))) {
      res.status(401).json({ error: "La contraseña no es correcta." });
      return;
    }
    const open = await prisma.order.count({ where: { userId, status: { in: ["PENDING", "PAID", "PROCESSING", "SHIPPED"] } } });
    const openReturns = await prisma.returnRequest.count({ where: { order: { userId }, status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] } } });
    if (open > 0 || openReturns > 0) {
      res.status(409).json({ error: "Tienes pedidos o devoluciones en curso. Cuando terminen podrás eliminar la cuenta." });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // La constancia de la supresión queda con el correo de antes.
      await recordConsent(tx, { userId, email: user.email, purpose: "DATA_PROCESSING", granted: false, channel: "SUPRESION", ipAddress: clientIp(req) });
      if (user.marketingOptIn) await recordConsent(tx, { userId, email: user.email, purpose: "MARKETING", granted: false, channel: "SUPRESION", ipAddress: clientIp(req) });
      // Los pedidos conservan su copia de la dirección; las direcciones guardadas se borran.
      await tx.order.updateMany({ where: { userId }, data: { shippingAddressId: null } });
      await tx.addressChangeLog.deleteMany({ where: { address: { userId } } });
      await tx.shippingAddress.deleteMany({ where: { userId } });
      // Sus opiniones (pueden traer datos personales) se borran con la cuenta.
      await tx.productReview.deleteMany({ where: { userId } });
      await tx.storeReview.deleteMany({ where: { userId } });
      await tx.cartItem.deleteMany({ where: { cart: { userId } } });
      await tx.cart.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.oAuthLoginCode.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `suprimido-${userId}@anonimo.invalid`,
          phone: null,
          passwordHash: null,
          provider: null,
          providerId: null,
          isActive: false,
          marketingOptIn: false,
          deletedAt: new Date(),
          tokenVersion: { increment: 1 },
        },
      });
    });
    forgetUserState(userId);
    res.json({ ok: true });
  })
);
