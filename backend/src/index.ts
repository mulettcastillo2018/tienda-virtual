import "dotenv/config";
import cors from "cors";
import express from "express";

import { authRouter } from "./routes/auth.routes";
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
app.use("/categories", categoriesRouter);
app.use("/products", productsRouter);
app.use("/cart", cartRouter);
app.use("/orders", ordersRouter);
app.use("/payments", paymentsRouter);

app.listen(port, () => {
  console.log(`API escuchando en http://localhost:${port}`);
});
