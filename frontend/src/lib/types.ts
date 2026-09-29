export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  discountPercentage: number | null;
  discountEndsAt: string | null;
  brand: string | null;
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
  createdAt: string;
}

export interface ProductFilters {
  minPrice: number;
  maxPrice: number;
  brands: string[];
}

export interface ProductDiscountLog {
  id: string;
  discountPercentage: number;
  startedAt: string;
  endsAt: string;
  createdAt: string;
  createdBy: { id: string; email: string };
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
  createdAt: string;
  updatedAt: string;
}

export interface AddressChangeLog {
  id: string;
  addressId: string;
  previousData: Record<string, unknown>;
  newData: Record<string, unknown>;
  changedAt: string;
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
  // Hasta cuándo se puede pagar un pedido pendiente.
  expiresAt: string | null;
  // Algo del pago quedó para que un administrador lo revise.
  needsReview?: boolean;
  reviewNote?: string | null;
  payments?: { status: string; paymentMethod: string | null; createdAt: string; providerTransactionId?: string | null }[];
  user?: { id: string; email: string };
  items: {
    id: string;
    productId: string;
    quantity: number;
    priceAtPurchase: number;
    product?: Product;
    discountLogId: string | null;
    discountLog?: { discountPercentage: number } | null;
  }[];
  shippingAddress?: ShippingAddress;
}

export type UserRole = "ADMIN" | "JURIDICO" | "CUSTOMER";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface UserProfile extends AuthUser {
  phone: string | null;
  createdAt: string;
}

export type PqrsType = "PETICION" | "QUEJA" | "RECLAMO" | "SUGERENCIA";
export type PqrsStatus = "RECIBIDO" | "EN_PROCESO" | "RESUELTO" | "CERRADO";

export interface PqrsStatusLog {
  id: string;
  fromStatus: PqrsStatus | null;
  toStatus: PqrsStatus;
  comment: string | null;
  attachmentUrl: string | null;
  changedAt: string;
  changedBy: { id: string; email: string; role: UserRole };
}

export interface Pqrs {
  id: string;
  type: PqrsType;
  subject: string;
  message: string;
  attachmentUrl: string | null;
  status: PqrsStatus;
  dueAt: string;
  orderId: string | null;
  response: string | null;
  responseAttachmentUrl: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; email: string; phone: string };
  respondedBy?: { id: string; email: string } | null;
  order?: { id: string } | null;
  statusLogs?: PqrsStatusLog[];
}

export interface PqrsStats {
  byStatus: Record<PqrsStatus, number>;
  byType: Record<PqrsType, number>;
  total: number;
  avgResponseTimeHours: number | null;
  overdue: number;
}

export interface Carrier {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string;
  isActive: boolean;
  sortOrder: number;
}

export interface SocialLink {
  id: string;
  name: string;
  iconUrl: string;
  url: string;
  isActive: boolean;
  sortOrder: number;
}

export interface PaymentMethod {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ContactInfo {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
}

export interface StoreReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  customerLabel: string;
}

export interface StoreReviewsResponse {
  items: StoreReview[];
  average: number;
  total: number;
}
