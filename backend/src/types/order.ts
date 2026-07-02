export type PaymentMethod = "COD" | "BANK_TRANSFER" | "ZALOPAY";

export type PaymentStatus = "PENDING" | "PAID";

export type OrderStatus =
  | "PROCESSING"
  | "SHIPPING"
  | "COMPLETED"
  | "CANCELLED";

export type ShippingCarrier =
  | "GHN"
  | "GHTK"
  | "JNT"
  | "VIETTEL_POST"
  | "OTHER";

export type OrderStatusHistoryItem = {
  status: OrderStatus;
  changedAt: string;
};

export type OrderItem = {
  productId: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number;
  quantity: number;
};

export type CustomerInfo = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  note?: string;
};

export type Order = {
  orderId: string;
  customer: CustomerInfo;

  /**
   * Cognito subject (`sub`) of the signed-in customer.
   * Undefined for guest checkout orders created before/without sign-in.
   */
  customerUserId?: string;

  items: OrderItem[];

  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;

  paymentTransactionId?: string;
  paidAt?: string;

  zalopayAppTransId?: string;
  zalopayOrderUrl?: string;
  zalopayPaymentExpiresAt?: string;

  orderStatus: OrderStatus;
  shippingCarrier?: ShippingCarrier;
  shippingCarrierName?: string;
  shippingTrackingCode?: string;
  shippedAt?: string;
  statusHistory?: OrderStatusHistoryItem[];

  createdAt: string;
  updatedAt: string;
};
