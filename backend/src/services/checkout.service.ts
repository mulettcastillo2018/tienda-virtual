import type { PaymentOption, Product } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getEffectivePrice, isDiscountActive } from "../lib/pricing";
import { includedTax } from "../lib/tax";
import { calculateShippingQuote } from "./carrier.service";
import { paymentDeadline } from "./orderLifecycle";
import { cashOnDelivery, COD_UNAVAILABLE_MESSAGE, getStoreSettings } from "./storeSettings";

// Errores del checkout con su código HTTP y un mensaje para el cliente.
export class CheckoutError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export const MAX_PER_PRODUCT = 99;

export interface CheckoutLine {
  productId: string;
  quantity: number;
}

// Factura a nombre de alguien (si no, va a consumidor final).
export interface BillingInfo {
  idType: string;
  idNumber: string;
  name: string;
}

export interface CheckoutAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string | null;
  phone: string;
}

type ResolvedLine = { product: Product; quantity: number };

// Productos del pedido, validados: siguen a la venta, alcanza el inventario y
// no pasan del tope. Primero lo que hay que quitar, después lo que hay que ajustar.
export async function resolveLines(lines: CheckoutLine[]): Promise<ResolvedLine[]> {
  if (lines.length === 0) throw new CheckoutError(400, "El carrito está vacío");
  const quantities = new Map<string, number>();
  for (const line of lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  const products = await prisma.product.findMany({ where: { id: { in: [...quantities.keys()] } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  const resolved = [...quantities].map(([productId, quantity]) => ({ product: byId.get(productId), quantity }));
  const retired = resolved.find((line) => !line.product?.isActive);
  if (retired) {
    throw new CheckoutError(
      409,
      retired.product
        ? `"${retired.product.name}" ya no está disponible. Quítalo del carrito para continuar.`
        : "Uno de los productos ya no está disponible. Quítalo del carrito para continuar."
    );
  }
  for (const line of resolved as ResolvedLine[]) {
    if (line.quantity > MAX_PER_PRODUCT) throw new CheckoutError(409, `Puedes llevar máximo ${MAX_PER_PRODUCT} unidades de "${line.product.name}".`);
    if (line.product.stock < line.quantity) throw new CheckoutError(409, `Sin stock suficiente de "${line.product.name}"`);
  }
  return resolved as ResolvedLine[];
}

// Lo que cuesta el pedido a una dirección: productos, envío y, si aplica, el
// recargo del pago contra entrega. `taxIncluded`: el IVA que ya va en esos
// precios (para mostrarlo antes de pagar).
export async function quoteOrder(lines: ResolvedLine[], address: Pick<CheckoutAddress, "postalCode" | "city">) {
  const weight = lines.reduce((sum, line) => sum + line.product.weightInGrams * line.quantity, 0);
  const shipping = calculateShippingQuote(address.postalCode, weight);
  const subtotal = lines.reduce((sum, line) => sum + getEffectivePrice(line.product) * line.quantity, 0);
  const cod = cashOnDelivery(await getStoreSettings(), address.city, subtotal + shipping.cost);
  const fiscal = await prisma.fiscalSettings.findUnique({ where: { id: "main" }, select: { shippingTaxRate: true } });
  const taxIncluded =
    lines.reduce((sum, line) => sum + includedTax(getEffectivePrice(line.product) * line.quantity, line.product.taxRate), 0) +
    includedTax(shipping.cost, fiscal?.shippingTaxRate ?? 0);
  return { subtotal, shippingCost: shipping.cost, carrier: shipping.carrier, total: subtotal + shipping.cost, taxIncluded, cod };
}

export type OrderQuote = Awaited<ReturnType<typeof quoteOrder>>;

function addressSnapshot(address: CheckoutAddress) {
  return {
    shippingFullName: address.fullName,
    shippingLine1: address.addressLine1,
    shippingLine2: address.addressLine2 ?? null,
    shippingCity: address.city,
    shippingState: address.state,
    shippingPostalCode: address.postalCode,
    shippingCountry: address.country ?? "CO",
    shippingPhone: address.phone,
  };
}

class InsufficientStockError extends Error {}

// Crea el pedido: reserva el inventario (todo o nada), copia la dirección y
// los precios del momento, y vacía el carrito si se compró desde uno.
export async function placeOrder(input: {
  lines: ResolvedLine[];
  quote: OrderQuote;
  paymentOption: PaymentOption;
  address: CheckoutAddress;
  userId: string | null;
  guestEmail: string | null;
  shippingAddressId: string | null;
  cartId: string | null;
  billing?: BillingInfo | null;
}) {
  const { lines, quote, paymentOption } = input;
  const cod = paymentOption === "CASH_ON_DELIVERY";
  if (cod && !quote.cod.available) throw new CheckoutError(409, COD_UNAVAILABLE_MESSAGE[quote.cod.reason!]);
  const codFee = cod ? quote.cod.fee : 0;

  // Para poder explicar después "por qué" un producto se facturó más barato,
  // cada línea se enlaza al descuento vigente en ese momento.
  const now = new Date();
  const discounted = lines.filter((line) => isDiscountActive(line.product)).map((line) => line.product.id);
  const discountLogs = discounted.length
    ? await prisma.productDiscountLog.findMany({ where: { productId: { in: discounted }, startedAt: { lte: now }, endsAt: { gte: now } } })
    : [];
  const discountLogByProduct = new Map(discountLogs.map((log) => [log.productId, log.id]));

  try {
    return await prisma.$transaction(async (tx) => {
      // Reserva atómica: si dos compras agotan el mismo producto, la segunda
      // no encuentra la fila con inventario suficiente y falla limpiamente.
      for (const line of lines) {
        const reserved = await tx.product.updateMany({
          where: { id: line.product.id, isActive: true, stock: { gte: line.quantity } },
          data: { stock: { decrement: line.quantity } },
        });
        if (reserved.count === 0) throw new InsufficientStockError(line.product.name);
      }

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          guestEmail: input.guestEmail,
          billingIdType: input.billing?.idType ?? null,
          billingIdNumber: input.billing?.idNumber ?? null,
          billingName: input.billing?.name ?? null,
          shippingAddressId: input.shippingAddressId,
          ...addressSnapshot(input.address),
          totalAmount: quote.total + codFee,
          shippingCost: quote.shippingCost,
          carrier: quote.carrier,
          paymentOption,
          codFee,
          // Contra entrega no tiene plazo para pagar: se cobra al entregar.
          expiresAt: cod ? null : paymentDeadline(),
          statusLogs: {
            create: { toStatus: "PENDING", reason: cod ? "Pedido creado (pago contra entrega)" : "Pedido creado", changedById: input.userId },
          },
          items: {
            create: lines.map((line) => ({
              productId: line.product.id,
              quantity: line.quantity,
              priceAtPurchase: getEffectivePrice(line.product),
              taxRate: line.product.taxRate,
              discountLogId: discountLogByProduct.get(line.product.id),
            })),
          },
        },
        include: { items: true },
      });
      if (input.cartId) await tx.cartItem.deleteMany({ where: { cartId: input.cartId } });
      return order;
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) throw new CheckoutError(409, `Sin stock suficiente de "${err.message}"`);
    throw err;
  }
}
