import "dotenv/config";
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

const app = express();
const port = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000" }));

// El webhook de Wompi necesita el body crudo antes que nada lo transforme,
// así que se monta antes del parser JSON general.
app.use("/payments/wompi/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/addresses", addressesRouter);
app.use("/categories", categoriesRouter);
app.use("/products", productsRouter);
app.use("/cart", cartRouter);
app.use("/orders", ordersRouter);
app.use("/payments", paymentsRouter);

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
});
