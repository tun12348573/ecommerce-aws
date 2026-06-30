export type PaymentMethod = "COD" | "BANK_TRANSFER" | "ZALOPAY";

export type PaymentStatus = "PENDING" | "PAID";

export type OrderStatus =
  | "PROCESSING"
  | "SHIPPING"
  | "COMPLETED"
  | "CANCELLED";

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
  statusHistory?: OrderStatusHistoryItem[];

  createdAt: string;
  updatedAt: string;
};

