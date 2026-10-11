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
  // IVA incluido en el precio: 19, 5 o 0 (excluido).
  taxRate: number;
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
  // Lo que impide comprar la línea tal como está (null si se puede).
  issue?: "INACTIVE" | "OUT_OF_STOCK" | "NOT_ENOUGH_STOCK" | null;
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

export type PaymentOption = "ONLINE" | "CASH_ON_DELIVERY";

export type CodUnavailableReason = "DISABLED" | "CITY" | "AMOUNT";

// Cotización antes de confirmar (POST /orders/quote).
export interface OrderQuote {
  subtotal: number;
  shippingCost: number;
  carrier: string;
  total: number;
  // IVA que ya va incluido en esos precios.
  taxIncluded: number;
  cod: { available: boolean; reason: CodUnavailableReason | null; fee: number; maxAmount: number; cities: string[] };
}

// Reglas del pago contra entrega (panel).
export interface CodSettings {
  codEnabled: boolean;
  codCities: string[];
  codMaxAmount: number;
  codFee: number;
}

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

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
  // null en las compras como invitado (entonces está guestEmail).
  user?: { id: string; email: string } | null;
  guestEmail?: string | null;
  paymentOption: PaymentOption;
  // Recargo por pago contra entrega (ya incluido en totalAmount).
  codFee: number;
  items: {
    id: string;
    productId: string;
    quantity: number;
    priceAtPurchase: number;
    product?: Product;
    discountLogId: string | null;
    discountLog?: { discountPercentage: number } | null;
  }[];
  // Copia de la dirección al momento de comprar (no cambia si el cliente edita la suya).
  shippingAddress?: OrderShipping;
  // Cliente: cuándo cambió de estado (sin notas internas).
  timeline?: { status: OrderStatus; at: string }[];
  // Factura a nombre de alguien (si no, consumidor final).
  billingIdType?: string | null;
  billingIdNumber?: string | null;
  billingName?: string | null;
  // Retracto y reversión: lo pedido y lo que todavía se puede pedir.
  returnRequests?: ReturnRequestSummary[];
  returnOptions?: Record<ReturnKind, { available: boolean; deadline: string | null }>;
  // Facturas electrónicas aceptadas por la DIAN.
  invoices?: { type: "INVOICE" | "CREDIT_NOTE"; fullNumber: string; uniqueCode: string | null; createdAt: string }[];
  // Panel: la bitácora completa.
  statusLogs?: { fromStatus: OrderStatus | null; toStatus: OrderStatus; reason: string | null; changedAt: string; changedBy: { email: string } | null }[];
}

export type OrderShipping = Pick<ShippingAddress, "fullName" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country" | "phone">;

// Una página del listado de pedidos del panel, con los conteos de cada pestaña.
export interface AdminOrdersPage {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<OrderStatus | "ALL" | "REVIEW" | "TO_CONFIRM", number>>;
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
  // El cliente solo recibe el rol de quien hizo el cambio.
  changedBy: { id?: string; email?: string; role: UserRole };
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

// Resumen del tablero de ventas (GET /sales/summary).
export interface SalesTotals {
  revenue: number;
  orders: number;
  units: number;
  avgTicket: number;
}

export interface SalesSummary {
  days: 7 | 30 | 90;
  from: string;
  to: string;
  current: SalesTotals;
  previous: SalesTotals;
  daily: { date: string; revenue: number; orders: number }[];
  topProducts: { id: string; name: string; units: number; revenue: number }[];
  byStatus: Partial<Record<OrderStatus, number>>;
  toShip: number;
  // Contra entrega pendientes de confirmar con el cliente.
  toConfirm: number;
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
  // Identificación del comerciante (Ley 1480, art. 50).
  legalName: string;
  nit: string;
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

// --- Retracto y reversión del pago (Ley 1480, arts. 47 y 51) ---

export type ReturnKind = "RETRACTO" | "REVERSION";
export type ReturnStatus = "REQUESTED" | "APPROVED" | "RECEIVED" | "REFUNDED" | "REJECTED";
export type ReversionCause = "FRAUDE" | "NO_SOLICITADA" | "NO_RECIBIDO" | "DEFECTUOSO";

export interface ReturnRequestSummary {
  id: string;
  type: ReturnKind;
  status: ReturnStatus;
  cause: ReversionCause | null;
  storeNote: string | null;
  deadlineAt: string;
  createdAt: string;
  refundReference: string | null;
}

export interface AdminReturn extends ReturnRequestSummary {
  customerNote: string | null;
  order: {
    id: string;
    status: OrderStatus;
    totalAmount: number;
    paymentOption: PaymentOption;
    guestEmail: string | null;
    shippingFullName: string | null;
    shippingPhone: string | null;
    user: { email: string } | null;
    payments: { paymentMethod: string | null; providerTransactionId: string | null }[];
  };
}

// --- Factura electrónica ---

export type FiscalDocumentStatus = "PENDING" | "SENT" | "ACCEPTED" | "REJECTED";

export interface FiscalSettingsView {
  enabled: boolean;
  enabledAt: string | null;
  alanubeUrl: string;
  alanubeCompanyId: string | null;
  resolutionNumber: string | null;
  prefix: string | null;
  rangeFrom: number | null;
  rangeTo: number | null;
  startDate: string | null;
  endDate: string | null;
  technicalKey: string | null;
  nextNumber: number | null;
  creditNotePrefix: string;
  creditNoteNext: number;
  shippingTaxRate: number;
  hasToken: boolean;
  tokenFromEnv: boolean;
  tokenSaved: boolean;
  missing: string[];
  warnings: string[];
}

export interface FiscalDocumentRow {
  id: string;
  orderId: string;
  type: "INVOICE" | "CREDIT_NOTE";
  prefix: string;
  number: number;
  status: FiscalDocumentStatus;
  uniqueCode: string | null;
  message: string | null;
  errors: string[];
  customerName: string;
  customerId: string;
  total: number;
  attempts: number;
  createdAt: string;
  cancels: { prefix: string; number: number } | null;
}
