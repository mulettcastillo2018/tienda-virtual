import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/prisma";

export const API_URL = process.env.E2E_API_URL ?? "http://localhost:4000";

// Contraseña de las cuentas desechables que crean las pruebas (se borran al
// terminar).
export const CLAVE_PRUEBA = "29bc41aa";

// Estas pruebas crean y borran datos: solo contra un entorno local de
// desarrollo, nunca producción.
export function comprobarEntorno() {
  const host = new URL(API_URL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && process.env.E2E_PERMITIR_REMOTO !== "1") {
    throw new Error(`E2E_API_URL apunta a ${host}. Estas pruebas crean y borran datos; si de verdad es un entorno de pruebas, usa E2E_PERMITIR_REMOTO=1.`);
  }
  if (!process.env.WOMPI_EVENTS_SECRET) throw new Error("Falta WOMPI_EVENTS_SECRET en el .env del backend: las pruebas firman eventos de Wompi con él.");
}

let fallos = 0;

export function verificar(condicion: unknown, mensaje: string) {
  console.log(`${condicion ? "  OK " : "  FALLA"} ${mensaje}`);
  if (!condicion) fallos++;
}

export const totalFallos = () => fallos;

// Respuesta sin tipar: en una prueba interesa comparar valores.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Respuesta = { status: number; data: any };

export async function req(method: string, path: string, body?: unknown, token?: string): Promise<Respuesta> {
  const res = await fetch(API_URL + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Para pasos de preparación que tienen que salir bien: si fallan, la prueba
// se detiene con el código y el mensaje de la API.
export function exigir(r: Respuesta, paso: string): Respuesta["data"] {
  if (r.status < 200 || r.status >= 300) throw new Error(`${paso} falló con ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

// Lo que las pruebas crean, para borrarlo al final pase lo que pase.
export interface Creados {
  usuarios: string[];
  productos: string[];
}

// Se crea directo en la base (el registro por la API tiene tope por IP y las
// pruebas se corren muchas veces seguidas) y se inicia sesión por la API.
export async function crearCliente(creados: Creados, etiqueta: string) {
  const email = `${etiqueta}_${Date.now()}_${Math.floor(Math.random() * 1000)}@tienda.test`;
  const user = await prisma.user.create({ data: { email, phone: "3001234567", passwordHash: await bcrypt.hash(CLAVE_PRUEBA, 10) } });
  creados.usuarios.push(user.id);
  await prisma.cart.create({ data: { userId: user.id } });
  const r = exigir(await req("POST", "/auth/login", { email, password: CLAVE_PRUEBA }), "Login cliente de prueba");
  return { id: user.id, token: r.token as string, email };
}

// Un administrador desechable (no se toca la clave de los administradores reales).
export async function crearAdmin(creados: Creados) {
  const email = `admin_e2e_${Date.now()}@tienda.test`;
  const user = await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(CLAVE_PRUEBA, 10), role: "ADMIN", phone: "3001234567" } });
  creados.usuarios.push(user.id);
  const r = exigir(await req("POST", "/auth/login", { email, password: CLAVE_PRUEBA }), "Login admin de prueba");
  return { id: user.id, token: r.token as string };
}

export async function crearProducto(creados: Creados, nombre: string, stock: number, price = 10000) {
  const categoria = await prisma.category.findFirstOrThrow();
  const producto = await prisma.product.create({
    data: {
      name: nombre,
      description: "Producto de prueba automática",
      price,
      stock,
      categoryId: categoria.id,
      images: [1, 2, 3, 4].map((n) => `https://images.unsplash.com/photo-e2e-${n}`),
      weightInGrams: 500,
      widthCm: 10,
      heightCm: 10,
      depthCm: 10,
      sku: `E2E-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    },
  });
  creados.productos.push(producto.id);
  return producto;
}

// Un evento de webhook firmado como lo firma Wompi (mismo secreto de eventos
// del .env del backend).
export function eventoWompi(transaction: {
  id: string;
  reference: string;
  status: string;
  amount_in_cents: number;
  currency?: string;
  payment_method_type?: string;
}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const data = { transaction: { currency: "COP", payment_method_type: "CARD", ...transaction } };
  const values = properties.map((path) => String(path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], data)));
  const checksum = crypto.createHash("sha256").update(`${values.join("")}${timestamp}${process.env.WOMPI_EVENTS_SECRET}`).digest("hex");
  return { event: "transaction.updated", data, environment: "test", signature: { properties, checksum }, timestamp, sent_at: new Date().toISOString() };
}

export async function enviarWebhook(evento: unknown): Promise<Respuesta> {
  const res = await fetch(`${API_URL}/payments/wompi/webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(evento) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

export async function limpiar(c: Creados) {
  const pedidos = (await prisma.order.findMany({ where: { OR: [{ userId: { in: c.usuarios } }, { items: { some: { productId: { in: c.productos } } } }] }, select: { id: true } })).map((o) => o.id);
  await prisma.pqrs.deleteMany({ where: { OR: [{ orderId: { in: pedidos } }, { userId: { in: c.usuarios } }] } });
  await prisma.storeReview.deleteMany({ where: { orderId: { in: pedidos } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: pedidos } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: pedidos } } });
  await prisma.orderStatusLog.deleteMany({ where: { OR: [{ orderId: { in: pedidos } }, { changedById: { in: c.usuarios } }] } });
  await prisma.order.deleteMany({ where: { id: { in: pedidos } } });
  await prisma.cartItem.deleteMany({ where: { OR: [{ cart: { userId: { in: c.usuarios } } }, { productId: { in: c.productos } }] } });
  await prisma.cart.deleteMany({ where: { userId: { in: c.usuarios } } });
  await prisma.addressChangeLog.deleteMany({ where: { address: { userId: { in: c.usuarios } } } });
  await prisma.shippingAddress.deleteMany({ where: { userId: { in: c.usuarios } } });
  await prisma.productDiscountLog.deleteMany({ where: { productId: { in: c.productos } } });
  await prisma.product.deleteMany({ where: { id: { in: c.productos } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: c.usuarios } } });
  await prisma.pqrsStatusLog.deleteMany({ where: { changedById: { in: c.usuarios } } });
  await prisma.user.deleteMany({ where: { id: { in: c.usuarios } } });
}
