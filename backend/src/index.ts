import "dotenv/config";
import path from "node:path";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { authRouter } from "./routes/auth.routes";
import { addressesRouter } from "./routes/addresses.routes";
import { categoriesRouter } from "./routes/categories.routes";
import { productsRouter } from "./routes/products.routes";
import { cartRouter } from "./routes/cart.routes";
import { ordersRouter } from "./routes/orders.routes";
import { paymentsRouter } from "./routes/payments.routes";
import { usersRouter } from "./routes/users.routes";
import { carriersRouter } from "./routes/carriers.routes";
import { contactInfoRouter } from "./routes/contactInfo.routes";
import { paymentMethodsRouter } from "./routes/paymentMethods.routes";
import { socialLinksRouter } from "./routes/socialLinks.routes";
import { uploadsRouter } from "./routes/uploads.routes";
import { pqrsRouter } from "./routes/pqrs.routes";
import { oauthRouter } from "./routes/oauth.routes";
import { reviewsRouter } from "./routes/reviews.routes";
import { startOrderExpiryJob } from "./services/payments.service";

const app = express();
const port = process.env.PORT ?? 4000;

// Detrás de un proxy (Render, Railway, Nginx...) todas las peticiones llegan
// desde la IP del proxy; esto hace que req.ip sea la del cliente real, que es
// la que usan los límites de intentos.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
app.disable("x-powered-by");

// Cabeceras de seguridad para todas las respuestas.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
});

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000" }));

// El webhook de Wompi necesita el body crudo antes que nada lo transforme,
// así que se monta antes del parser JSON general.
app.use("/payments/wompi/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Archivos subidos (imágenes de productos, adjuntos de PQRS). Se sirven como
// contenido inerte: aunque alguien lograra subir un HTML, el navegador no
// ejecuta nada (sandbox). Se permite mostrarlos desde el frontend, que está
// en otro origen.
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"), {
    setHeaders: (res) => {
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/auth", oauthRouter);
app.use("/addresses", addressesRouter);
app.use("/categories", categoriesRouter);
app.use("/products", productsRouter);
app.use("/cart", cartRouter);
app.use("/orders", ordersRouter);
app.use("/payments", paymentsRouter);
app.use("/users", usersRouter);
app.use("/carriers", carriersRouter);
app.use("/contact-info", contactInfoRouter);
app.use("/payment-methods", paymentMethodsRouter);
app.use("/social-links", socialLinksRouter);
app.use("/uploads", uploadsRouter);
app.use("/pqrs", pqrsRouter);
app.use("/store-reviews", reviewsRouter);

// Manejador de errores global: cualquier error no atrapado en las rutas
// (incluida una caída de la base de datos) termina aquí en vez de tumbar
// el proceso completo.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Error interno del servidor." });
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
  // Cancela los pedidos que no se pagaron a tiempo y libera su inventario.
  startOrderExpiryJob();
});
