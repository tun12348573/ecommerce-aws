import type { CartItem } from "@/types/cart";

export type PaymentMethod = "COD" | "BANK_TRANSFER" | "ZALOPAY";

export type PaymentStatus = "PENDING" | "PAID";

export type OrderStatus =
  | "PROCESSING"
  | "SHIPPING"
  | "COMPLETED"
  | "CANCELLED";

export type CheckoutCustomer = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  note?: string;
};

export type OrderItem = {
  productId: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number;
  quantity: number;
};

export type Order = {
  orderId: string;
  customer: CheckoutCustomer;
  items: OrderItem[];

  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;

  createdAt: string;
  updatedAt?: string;
};

export type CreateOrderRequest = {
  items: CartItem[];
  customer: CheckoutCustomer;
  paymentMethod: PaymentMethod;
};

export type OrderResponse = {
  data: Order;
};

