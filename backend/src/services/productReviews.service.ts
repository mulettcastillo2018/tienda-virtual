import { prisma } from "../lib/prisma";

// Promedio y cantidad de reseñas visibles de cada producto (para el catálogo
// y la ficha). Productos sin reseñas no aparecen en el mapa.
export async function ratingsFor(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, { average: number; count: number }>();
  const rows = await prisma.productReview.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds }, hiddenAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.productId, { average: Math.round((row._avg.rating ?? 0) * 10) / 10, count: row._count._all }]));
}

// Agrega ratingAverage / ratingCount a cada producto.
export async function withRatings<T extends { id: string }>(products: T[]) {
  const ratings = await ratingsFor(products.map((p) => p.id));
  return products.map((p) => ({ ...p, ratingAverage: ratings.get(p.id)?.average ?? null, ratingCount: ratings.get(p.id)?.count ?? 0 }));
}

// El pedido entregado que prueba que el cliente compró y recibió el producto.
export function deliveredOrderWith(userId: string, productId: string) {
  return prisma.order.findFirst({
    where: { userId, status: "DELIVERED", items: { some: { productId } } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

// El correo a medias: se ve que es una persona real sin exponer su dirección
// (ni su largo).
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}
