interface DiscountableProduct {
  price: number;
  discountPercentage: number | null;
  discountEndsAt: string | null;
}

export function isDiscountActive(product: DiscountableProduct): boolean {
  if (!product.discountPercentage) return false;
  if (product.discountEndsAt && new Date(product.discountEndsAt) < new Date()) return false;
  return true;
}

export function getEffectivePrice(product: DiscountableProduct): number {
  if (!isDiscountActive(product)) return product.price;
  return Math.round(product.price * (1 - product.discountPercentage! / 100));
}
