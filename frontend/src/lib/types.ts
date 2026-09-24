export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  categoryId: string;
  category?: Category;
  images: string[];
  weightInGrams: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  sku: string;
  isActive: boolean;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  product: Product;
}

export interface Cart {
  id: string;
  items: CartItem[];
}

export interface ShippingAddress {
  id: string;
  fullName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export interface Order {
  id: string;
  totalAmount: number;
  shippingCost: number;
  carrier: string | null;
  trackingNumber: string | null;
  status: OrderStatus;
  createdAt: string;
  items: { id: string; productId: string; quantity: number; priceAtPurchase: number; product?: Product }[];
  shippingAddress?: ShippingAddress;
}

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "CUSTOMER";
}
