import "dotenv/config";
import { randomUUID } from "node:crypto";

import cors from "cors";
import express from "express";
import type { Request, Response } from "express";

import {
  createProductImageUploadUrl,
  ProductImageUploadError,
} from "./services/product-image-upload.service";

import {
  sendOrderCancelledEmail,
  sendOrderCreatedEmail,
  sendPaymentConfirmedEmail,
  sendRefundCompletedEmail,
  sendShippingUpdatedEmail,
} from "./services/order-email.service";

import {
  createProduct,
  deleteProductById,
  getProductById,
  getProductBySlug,
  listProducts,
  updateProduct,
} from "./repositories/product.repository";

import {
  beginZaloPayRefund,
  createOrderAndDecrementStock,
  getOrderById,
  listOrders,
  listOrdersByCustomerUserId,
  listZaloPayRefundOrders,
  markZaloPayRefundFailed,
  markZaloPayRefundPending,
  markZaloPayOrderPaid,
  saveZaloPayPaymentSession,
  syncZaloPayRefundStatus,
  updateOrderStatus,
  updateOrderShipping,
} from "./repositories/order.repository";

import {
  cancelOrderAndRestock,
  OrderCancellationError,
} from "./services/order-cancellation.service";

import {
  createZaloPayOrder,
  getOrderIdFromZaloPayAppTransId,
  queryZaloPayOrder,
  verifyZaloPayCallback,
  ZaloPayPaymentError,
} from "./services/zalopay-payment.service";

import {
  createZaloPayMerchantRefundId,
  createZaloPayRefund,
  queryZaloPayRefund,
  ZaloPayRefundError,
} from "./services/zalopay-refund.service";

import type { ProductInput } from "./types/product";
import type {
  CustomerInfo,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  RefundStatus,
  ShippingCarrier,
} from "./types/order";

import { buildAdminDashboard } from "./services/admin-dashboard.service";

export const app = express();

app.use(cors());
app.use(express.json());



type CheckoutItemInput = {
  productId?: unknown;
  quantity?: unknown;
};

function parseProductInput(body: Partial<ProductInput>): ProductInput | null {
  const {
    name,
    slug,
    category,
    description,
    price,
    salePrice,
    stock,
    image,
  } = body;

  if (
    !name ||
    !slug ||
    !category ||
    !description ||
    price === undefined ||
    salePrice === undefined ||
    stock === undefined
  ) {
    return null;
  }

  return {
    name,
    slug,
    category,
    description,
    price: Number(price),
    salePrice: Number(salePrice),
    stock: Number(stock),
    image: image || "https://placehold.co/600x600",
  };
}

function normalizeCheckoutItems(
  input: unknown
): Array<{ productId: string; quantity: number }> | null {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const quantities = new Map<string, number>();

  for (const rawItem of input) {
    if (!rawItem || typeof rawItem !== "object") {
      return null;
    }

    const item = rawItem as CheckoutItemInput;

    if (
      typeof item.productId !== "string" ||
      !item.productId.trim() ||
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return null;
    }

    const currentQuantity = quantities.get(item.productId) || 0;

    quantities.set(item.productId, currentQuantity + item.quantity);
  }

  const items = Array.from(
    quantities,
    ([productId, quantity]) => ({
      productId,
      quantity,
    })
  );

  // DynamoDB transaction tối đa 100 actions.
  // 1 action tạo order, nên chỉ nhận tối đa 99 sản phẩm khác nhau.
  if (items.length > 99) {
    return null;
  }

  return items;
}


function normalizePhoneForTracking(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("84") && digits.length === 11) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}

function maskPhone(value: string): string {
  const phone = normalizePhoneForTracking(value);

  if (phone.length < 6) {
    return "••••••";
  }

  return `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
}

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    service: "ecommerce-backend",
    database: "DynamoDB",
  });
});

// =========================
// Product APIs
// =========================

app.get("/products", async (req, res) => {
  try {
    const products = await listProducts();

    return res.json({
      data: products,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot get products",
    });
  }
});

app.get("/products/:slug", async (req, res) => {
  try {
    const product = await getProductBySlug(req.params.slug);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    return res.json({
      data: product,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot get product",
    });
  }
});

// =========================
// Order APIs
// =========================

type CreateOrderBody = {
  items?: unknown;
  customer?: CustomerInfo;
  paymentMethod?: unknown;
};

type AuthenticatedCustomer = {
  userId: string;
  email: string;
};

function getAuthenticatedCustomer(req: Request): AuthenticatedCustomer | null {
  const authorization = req.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return null;
  }

  try {
    const payloadSegment = token.split(".")[1];

    if (!payloadSegment) {
      return null;
    }

    const claims = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8")
    ) as {
      sub?: unknown;
      email?: unknown;
      token_use?: unknown;
    };

    if (
      claims.token_use !== "id" ||
      typeof claims.sub !== "string" ||
      !claims.sub.trim() ||
      typeof claims.email !== "string" ||
      !claims.email.trim()
    ) {
      return null;
    }

    return {
      userId: claims.sub,
      email: claims.email.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

function parsePaymentMethod(value: unknown): PaymentMethod | null {
  if (
    value === "COD" ||
    value === "BANK_TRANSFER" ||
    value === "ZALOPAY"
  ) {
    return value;
  }

  return null;
}

async function createOrderFromCheckout(
  body: CreateOrderBody,
  authenticatedCustomer?: AuthenticatedCustomer
): Promise<Order> {
  const checkoutItems = normalizeCheckoutItems(body.items);

  if (!checkoutItems) {
    throw new Error("Cart is empty or invalid");
  }

  const rawCustomer = body.customer;

  if (
    !rawCustomer ||
    !rawCustomer.fullName?.trim() ||
    !rawCustomer.phone?.trim() ||
    !rawCustomer.address?.trim() ||
    (!authenticatedCustomer && !rawCustomer.email?.trim())
  ) {
    throw new Error("Customer information is required");
  }

  const paymentMethod =
    body.paymentMethod === undefined
      ? "COD"
      : parsePaymentMethod(body.paymentMethod);

  if (!paymentMethod) {
    throw new Error("Phương thức thanh toán không hợp lệ.");
  }

  const customer: CustomerInfo = {
    fullName: rawCustomer.fullName.trim(),
    phone: rawCustomer.phone.trim(),
    email:
      authenticatedCustomer?.email ??
      rawCustomer.email.trim().toLowerCase(),
    address: rawCustomer.address.trim(),
    note: rawCustomer.note?.trim() || undefined,
  };

  const orderItems: OrderItem[] = [];

  for (const item of checkoutItems) {
    const product = await getProductById(item.productId);

    if (!product) {
      throw new Error(`Product ${item.productId} not found`);
    }

    if (item.quantity > product.stock) {
      const error = new Error(
        `${product.name} does not have enough stock`
      );

      error.name = "InsufficientStockError";

      throw error;
    }

    orderItems.push({
      productId: product.productId,
      name: product.name,
      slug: product.slug,
      price: product.price,
      salePrice: product.salePrice,
      quantity: item.quantity,
    });
  }

  const subtotal = orderItems.reduce((total, item) => {
    return total + item.salePrice * item.quantity;
  }, 0);

  const shippingFee = 30000;
  const discount = 0;
  const now = new Date().toISOString();

  const order: Order = {
    orderId: `ord_${randomUUID()}`,
    customer,
    customerUserId: authenticatedCustomer?.userId,
    items: orderItems,

    subtotal,
    shippingFee,
    discount,
    total: subtotal + shippingFee - discount,

    paymentMethod,
    paymentStatus: "PENDING",
    orderStatus: "PROCESSING",

    statusHistory: [
      {
        status: "PROCESSING",
        changedAt: now,
      },
    ],

    createdAt: now,
    updatedAt: now,
  };

  try {
    await createOrderAndDecrementStock(order);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "TransactionCanceledException"
    ) {
      const stockError = new Error(
        "Không thể tạo đơn hàng vì tồn kho vừa thay đổi. Hãy kiểm tra lại giỏ hàng."
      );

      stockError.name = "InsufficientStockError";

      throw stockError;
    }

    throw error;
  }

  await sendOrderCreatedEmail(order);

  return order;
}

function sendOrderCreationError(res: Response, error: unknown) {
  if (error instanceof Error) {
    if (
      error.name === "InsufficientStockError" ||
      error.message.includes("does not have enough stock")
    ) {
      return res.status(409).json({
        message: error.message,
      });
    }

    if (
      error.message === "Cart is empty or invalid" ||
      error.message === "Customer information is required" ||
      error.message === "Phương thức thanh toán không hợp lệ."
    ) {
      return res.status(400).json({
        message: error.message,
      });
    }

    if (error.message.includes("not found")) {
      return res.status(404).json({
        message: error.message,
      });
    }
  }

  console.error(error);

  return res.status(500).json({
    message: "Cannot create order",
  });
}

app.post("/orders", async (req, res) => {
  try {
    const order = await createOrderFromCheckout(
      req.body as CreateOrderBody
    );

    return res.status(201).json({
      data: order,
    });
  } catch (error) {
    return sendOrderCreationError(res, error);
  }
});

app.post("/account/orders", async (req, res) => {
  const authenticatedCustomer = getAuthenticatedCustomer(req);

  if (!authenticatedCustomer) {
    return res.status(401).json({
      message: "Không thể xác thực tài khoản khách hàng.",
    });
  }

  try {
    const order = await createOrderFromCheckout(
      req.body as CreateOrderBody,
      authenticatedCustomer
    );

    return res.status(201).json({
      data: order,
    });
  } catch (error) {
    return sendOrderCreationError(res, error);
  }
});

app.get("/account/orders", async (req, res) => {
  const authenticatedCustomer = getAuthenticatedCustomer(req);

  if (!authenticatedCustomer) {
    return res.status(401).json({
      message: "Không thể xác thực tài khoản khách hàng.",
    });
  }

  try {
    const orders = await listOrdersByCustomerUserId(
      authenticatedCustomer.userId
    );

    return res.json({
      data: orders,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể lấy lịch sử đơn hàng.",
    });
  }
});

app.get("/account/orders/:orderId", async (req, res) => {
  const authenticatedCustomer = getAuthenticatedCustomer(req);

  if (!authenticatedCustomer) {
    return res.status(401).json({
      message: "Không thể xác thực tài khoản khách hàng.",
    });
  }

  try {
    const orderId = req.params.orderId.trim();

    if (!orderId) {
      return res.status(400).json({
        message: "Mã đơn hàng không hợp lệ.",
      });
    }

    const order = await getOrderById(orderId);

    if (
      !order ||
      order.customerUserId !== authenticatedCustomer.userId
    ) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng của tài khoản này.",
      });
    }

    return res.json({
      data: order,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể lấy chi tiết đơn hàng.",
    });
  }
});

app.patch("/account/orders/:orderId/cancel", async (req, res) => {
  const authenticatedCustomer = getAuthenticatedCustomer(req);

  if (!authenticatedCustomer) {
    return res.status(401).json({
      message: "Không thể xác thực tài khoản khách hàng.",
    });
  }

  try {
    const orderId = req.params.orderId.trim();

    if (!orderId) {
      return res.status(400).json({
        message: "Mã đơn hàng không hợp lệ.",
      });
    }

    const existingOrder = await getOrderById(orderId);

    if (
      !existingOrder ||
      existingOrder.customerUserId !== authenticatedCustomer.userId
    ) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng của tài khoản này.",
      });
    }

    if (existingOrder.orderStatus !== "PROCESSING") {
      return res.status(409).json({
        message:
          "Bạn chỉ có thể hủy đơn khi shop chưa bắt đầu giao hàng.",
      });
    }

    try {
      await cancelOrderAndRestock(existingOrder, ["PROCESSING"]);
    } catch (error) {
      if (error instanceof OrderCancellationError) {
        return res.status(400).json({
          message: error.message,
        });
      }

      if (
        error instanceof Error &&
        error.name === "TransactionCanceledException"
      ) {
        return res.status(409).json({
          message:
            "Đơn hàng hoặc tồn kho vừa được cập nhật. Hãy tải lại trang và thử lại.",
        });
      }

      throw error;
    }

    const cancelledOrder = await getOrderById(existingOrder.orderId);

    if (!cancelledOrder) {
      return res.status(500).json({
        message: "Không thể lấy đơn hàng sau khi hủy.",
      });
    }

    await sendOrderCancelledEmail(cancelledOrder);

    return res.json({
      data: cancelledOrder,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể hủy đơn hàng.",
    });
  }
});

// =========================
// ZaloPay Sandbox Payment APIs
// =========================

app.post("/payments/zalopay/create", async (req, res) => {
  try {
    const { orderId, phone } = req.body as {
      orderId?: unknown;
      phone?: unknown;
    };

    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      typeof phone !== "string" ||
      !phone.trim()
    ) {
      return res.status(400).json({
        message: "Mã đơn hàng và số điện thoại là bắt buộc.",
      });
    }

    const order = await getOrderById(orderId.trim());

    if (!order) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    if (
      normalizePhoneForTracking(order.customer.phone) !==
      normalizePhoneForTracking(phone)
    ) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng phù hợp.",
      });
    }

    if (order.paymentMethod !== "ZALOPAY") {
      return res.status(409).json({
        message: "Đơn hàng này không sử dụng ZaloPay.",
      });
    }

    if (order.orderStatus === "CANCELLED") {
      return res.status(409).json({
        message: "Không thể thanh toán đơn hàng đã hủy.",
      });
    }

    if (order.paymentStatus === "PAID") {
      return res.status(409).json({
        message: "Đơn hàng này đã được thanh toán.",
      });
    }

    const existingExpiresAt = new Date(
      order.zalopayPaymentExpiresAt ?? ""
    ).getTime();

    if (
      order.zalopayOrderUrl &&
      !Number.isNaN(existingExpiresAt) &&
      existingExpiresAt > Date.now()
    ) {
      return res.json({
        data: {
          orderId: order.orderId,
          amount: order.total,
          orderUrl: order.zalopayOrderUrl,
          expiresAt: order.zalopayPaymentExpiresAt,
        },
      });
    }

    if (order.zalopayAppTransId) {
      return res.status(409).json({
        message:
          "Phiên thanh toán trước đã hết hạn. Hãy tạo một đơn hàng mới để thanh toán lại.",
      });
    }

    const payment = await createZaloPayOrder(order);

    const updatedOrder = await saveZaloPayPaymentSession({
      orderId: order.orderId,
      appTransId: payment.appTransId,
      orderUrl: payment.orderUrl,
      expiresAt: payment.expiresAt,
    });

    if (!updatedOrder) {
      return res.status(404).json({
        message: "Không thể lưu phiên thanh toán ZaloPay.",
      });
    }

    return res.status(201).json({
      data: {
        orderId: updatedOrder.orderId,
        amount: updatedOrder.total,
        orderUrl: payment.orderUrl,
        expiresAt: payment.expiresAt,
      },
    });
  } catch (error) {
    console.error(error);

    if (error instanceof ZaloPayPaymentError) {
      return res.status(502).json({
        message: error.message,
      });
    }

    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return res.status(409).json({
        message:
          "Đơn hàng đã có phiên thanh toán hoặc không còn đủ điều kiện thanh toán.",
      });
    }

    return res.status(500).json({
      message: "Không thể tạo giao dịch ZaloPay.",
    });
  }
});

app.post("/payments/zalopay/callback", async (req, res) => {
  try {
    const { data, mac } = req.body as {
      data?: unknown;
      mac?: unknown;
    };

    const callback = await verifyZaloPayCallback(data, mac);

    const orderId = getOrderIdFromZaloPayAppTransId(
      callback.app_trans_id
    );

    if (!orderId) {
      return res.json({
        return_code: 2,
        return_message: "invalid app_trans_id",
      });
    }

    const order = await getOrderById(orderId);

    if (
      !order ||
      order.paymentMethod !== "ZALOPAY" ||
      order.zalopayAppTransId !== callback.app_trans_id ||
      order.total !== callback.amount
    ) {
      return res.json({
        return_code: 2,
        return_message: "order validation failed",
      });
    }

    if (order.paymentStatus === "PAID") {
      return res.json({
        return_code: 1,
        return_message: "success",
      });
    }

    try {
      const paidOrder = await markZaloPayOrderPaid({
        orderId: order.orderId,
        appTransId: callback.app_trans_id,
        amount: callback.amount,
        transactionId: String(callback.zp_trans_id),
        paidAt: new Date(callback.server_time).toISOString(),
      });
      if (paidOrder) {
        await sendPaymentConfirmedEmail(paidOrder);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ConditionalCheckFailedException"
      ) {
        const latestOrder = await getOrderById(order.orderId);

        if (latestOrder?.paymentStatus === "PAID") {
          return res.json({
            return_code: 1,
            return_message: "success",
          });
        }
      }

      throw error;
    }

    return res.json({
      return_code: 1,
      return_message: "success",
    });
  } catch (error) {
    console.error(error);

    return res.json({
      return_code: 2,
      return_message: "invalid",
    });
  }
});

app.post("/payments/zalopay/query", async (req, res) => {
  try {
    const { orderId, phone } = req.body as {
      orderId?: unknown;
      phone?: unknown;
    };

    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      typeof phone !== "string" ||
      !phone.trim()
    ) {
      return res.status(400).json({
        message: "Mã đơn hàng và số điện thoại là bắt buộc.",
      });
    }

    const order = await getOrderById(orderId.trim());

    if (!order) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    if (
      normalizePhoneForTracking(order.customer.phone) !==
      normalizePhoneForTracking(phone)
    ) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng phù hợp.",
      });
    }

    if (order.paymentMethod !== "ZALOPAY") {
      return res.status(409).json({
        message: "Đơn hàng này không sử dụng ZaloPay.",
      });
    }

    if (order.paymentStatus === "PAID") {
      return res.json({
        data: {
          orderId: order.orderId,
          paymentStatus: order.paymentStatus,
          paidAt: order.paidAt,
          paymentTransactionId: order.paymentTransactionId,
        },
      });
    }

    if (!order.zalopayAppTransId) {
      return res.status(409).json({
        message: "Đơn hàng chưa có phiên thanh toán ZaloPay.",
      });
    }

    const queryResult = await queryZaloPayOrder(
      order.zalopayAppTransId
    );

    if (queryResult.returnCode !== 1) {
      return res.json({
        data: {
          orderId: order.orderId,
          paymentStatus: order.paymentStatus,
          zalopayStatus: queryResult.returnCode,
          zalopayMessage: queryResult.returnMessage,
        },
      });
    }

    if (
      queryResult.amount !== order.total ||
      !queryResult.transactionId ||
      !queryResult.paidAt
    ) {
      return res.status(502).json({
        message: "Dữ liệu thanh toán ZaloPay không hợp lệ.",
      });
    }

    let updatedOrder: Order | null;
    let didConfirmPayment = false;

    try {
      updatedOrder = await markZaloPayOrderPaid({
        orderId: order.orderId,
        appTransId: order.zalopayAppTransId,
        amount: queryResult.amount,
        transactionId: queryResult.transactionId,
        paidAt: queryResult.paidAt,
      });

      didConfirmPayment = Boolean(updatedOrder);
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ConditionalCheckFailedException"
      ) {
        updatedOrder = await getOrderById(order.orderId);
      } else {
        throw error;
      }
    }

    if (!updatedOrder) {
      return res.status(500).json({
        message: "Không thể cập nhật trạng thái thanh toán ZaloPay.",
      });
    }

    if (didConfirmPayment) {
      await sendPaymentConfirmedEmail(updatedOrder);
    }

    return res.json({
      data: {
        orderId: updatedOrder?.orderId,
        paymentStatus: updatedOrder?.paymentStatus,
        paidAt: updatedOrder?.paidAt,
        paymentTransactionId: updatedOrder?.paymentTransactionId,
      },
    });
  } catch (error) {
    console.error(error);

    if (error instanceof ZaloPayPaymentError) {
      return res.status(502).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Không thể truy vấn giao dịch ZaloPay.",
    });
  }
});

app.post("/order-tracking", async (req, res) => {
  try {
    const { orderId, phone } = req.body as {
      orderId?: unknown;
      phone?: unknown;
    };

    if (
      typeof orderId !== "string" ||
      !orderId.trim() ||
      typeof phone !== "string" ||
      !phone.trim()
    ) {
      return res.status(400).json({
        message: "Vui lòng nhập mã đơn hàng và số điện thoại.",
      });
    }

    const normalizedOrderId = orderId.trim();
    const normalizedPhone = normalizePhoneForTracking(phone);

    if (!normalizedPhone) {
      return res.status(400).json({
        message: "Số điện thoại không hợp lệ.",
      });
    }

    const order = await getOrderById(normalizedOrderId);
    const customer = order?.customer;

    if (
      !order ||
      !customer ||
      !customer.phone ||
      normalizePhoneForTracking(customer.phone) !== normalizedPhone
    ) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng phù hợp.",
      });
    }

    const statusHistory =
      order.statusHistory && order.statusHistory.length > 0
        ? order.statusHistory
        : [
            {
              status: "PROCESSING" as const,
              changedAt: order.createdAt,
            },
          ];

    return res.json({
      data: {
        orderId: order.orderId,

        customer: {
          fullName: customer.fullName,
          phone: maskPhone(customer.phone),
        },

        items: (order.items ?? []).map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          salePrice: item.salePrice,
        })),

        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        discount: order.discount,
        total: order.total,

        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        shippingCarrier: order.shippingCarrier,
        shippingCarrierName: order.shippingCarrierName,
        shippingTrackingCode: order.shippingTrackingCode,
        shippedAt: order.shippedAt,
        statusHistory,

        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể tra cứu đơn hàng.",
    });
  }
});

// =========================
// Admin Order APIs
// =========================

app.get("/admin/dashboard", async (req, res) => {
  try {
    const requestedDays = Number(req.query.days);

    const days =
      requestedDays === 7 ||
      requestedDays === 14 ||
      requestedDays === 30
        ? requestedDays
        : 14;

    const orders = await listOrders();

    return res.json({
      data: buildAdminDashboard(orders, days),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể lấy dữ liệu dashboard.",
    });
  }
});

app.get("/admin/orders", async (req, res) => {
  try {
    const orders = await listOrders();

    return res.json({
      data: orders,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot get admin orders",
    });
  }
});


app.get("/admin/refunds", async (req, res) => {
  try {
    const rawStatus =
      typeof req.query.status === "string"
        ? req.query.status.trim().toUpperCase()
        : "";

    const validRefundStatuses: RefundStatus[] = [
      "REQUESTING",
      "PENDING",
      "REFUNDED",
      "FAILED",
    ];

    if (
      rawStatus &&
      rawStatus !== "ALL" &&
      !validRefundStatuses.includes(rawStatus as RefundStatus)
    ) {
      return res.status(400).json({
        message: "Trạng thái hoàn tiền không hợp lệ.",
      });
    }

    const refundStatus =
      rawStatus && rawStatus !== "ALL"
        ? (rawStatus as RefundStatus)
        : undefined;

    const orders = await listZaloPayRefundOrders(refundStatus);

    return res.json({
      data: orders,
      meta: {
        status: refundStatus ?? "ALL",
        total: orders.length,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể lấy danh sách hoàn tiền.",
    });
  }
});


function isConditionalCheckFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ConditionalCheckFailedException" ||
      error.name === "TransactionCanceledException")
  );
}

app.patch("/admin/orders/:orderId/refund", async (req, res) => {
  try {
    const orderId = req.params.orderId.trim();

    const { reason } = req.body as {
      reason?: unknown;
    };

    if (!orderId) {
      return res.status(400).json({
        message: "Mã đơn hàng không hợp lệ.",
      });
    }

    const refundReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim()
        : `Hoan tien don hang ${orderId}`;

    if (refundReason.length > 256) {
      return res.status(400).json({
        message: "Lý do hoàn tiền không được vượt quá 256 ký tự.",
      });
    }

    const existingOrder = await getOrderById(orderId);

    if (!existingOrder) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    if (
      existingOrder.paymentMethod !== "ZALOPAY" ||
      existingOrder.paymentStatus !== "PAID"
    ) {
      return res.status(409).json({
        message: "Chỉ đơn ZaloPay đã thanh toán mới có thể hoàn tiền.",
      });
    }

    if (existingOrder.orderStatus !== "CANCELLED") {
      return res.status(409).json({
        message: "Chỉ hoàn tiền sau khi đơn hàng đã được hủy.",
      });
    }

    if (!existingOrder.paymentTransactionId) {
      return res.status(409).json({
        message: "Đơn hàng không có mã giao dịch ZaloPay.",
      });
    }

    if (
      existingOrder.refundStatus === "REQUESTING" ||
      existingOrder.refundStatus === "PENDING" ||
      existingOrder.refundStatus === "REFUNDED"
    ) {
      return res.status(409).json({
        message: "Đơn hàng đã có yêu cầu hoàn tiền đang xử lý hoặc đã hoàn tất.",
      });
    }

    const merchantRefundId = await createZaloPayMerchantRefundId();

    let lockedOrder: Order | null;

    try {
      lockedOrder = await beginZaloPayRefund({
        orderId: existingOrder.orderId,
        merchantRefundId,
        amount: existingOrder.total,
        reason: refundReason,
      });
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        return res.status(409).json({
          message:
            "Trạng thái hoàn tiền vừa được thay đổi. Hãy tải lại đơn hàng trước khi thử lại.",
        });
      }

      throw error;
    }

    if (!lockedOrder) {
      return res.status(500).json({
        message: "Không thể tạo yêu cầu hoàn tiền.",
      });
    }

    try {
      const providerResult = await createZaloPayRefund({
        merchantRefundId,
        zpTransactionId: existingOrder.paymentTransactionId,
        amount: existingOrder.total,
        description: refundReason,
      });

      const pendingOrder = await markZaloPayRefundPending({
        orderId: existingOrder.orderId,
        merchantRefundId,
        providerRefundId: providerResult.providerRefundId,
        providerMessage: providerResult.returnMessage,
      });

      return res.status(202).json({
        data: pendingOrder ?? lockedOrder,
        message:
          "Đã gửi yêu cầu hoàn tiền đến ZaloPay. Hãy truy vấn lại để xác nhận kết quả.",
      });
    } catch (error) {
      const message =
        error instanceof ZaloPayRefundError
          ? error.message
          : "Không thể gửi yêu cầu hoàn tiền đến ZaloPay.";

      try {
        await markZaloPayRefundFailed({
          orderId: existingOrder.orderId,
          merchantRefundId,
          message,
        });
      } catch (syncError) {
        console.error("Không thể đồng bộ lỗi hoàn tiền vào DynamoDB.", syncError);
      }

      return res.status(502).json({
        message,
      });
    }
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể khởi tạo hoàn tiền ZaloPay.",
    });
  }
});

app.patch("/admin/orders/:orderId/refund/query", async (req, res) => {
  try {
    const orderId = req.params.orderId.trim();

    if (!orderId) {
      return res.status(400).json({
        message: "Mã đơn hàng không hợp lệ.",
      });
    }

    const existingOrder = await getOrderById(orderId);

    if (!existingOrder) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    if (
      existingOrder.paymentMethod !== "ZALOPAY" ||
      existingOrder.paymentStatus !== "PAID" ||
      existingOrder.orderStatus !== "CANCELLED"
    ) {
      return res.status(409).json({
        message: "Đơn hàng không đủ điều kiện để truy vấn hoàn tiền ZaloPay.",
      });
    }

    if (!existingOrder.refundMerchantId) {
      return res.status(409).json({
        message: "Đơn hàng chưa có yêu cầu hoàn tiền ZaloPay.",
      });
    }

    if (existingOrder.refundStatus === "REFUNDED") {
      return res.json({
        data: existingOrder,
        message: "Đơn hàng đã được hoàn tiền.",
      });
    }

    const providerResult = await queryZaloPayRefund(
      existingOrder.refundMerchantId
    );

    if (providerResult.providerState === "UNKNOWN") {
      return res.status(202).json({
        data: existingOrder,
        message: providerResult.returnMessage,
      });
    }

    const updatedOrder = await syncZaloPayRefundStatus({
      orderId: existingOrder.orderId,
      merchantRefundId: existingOrder.refundMerchantId,
      status: providerResult.providerState,
      providerRefundId: providerResult.providerRefundId,
      providerMessage: providerResult.returnMessage,
    });

    const orderAfterSync = updatedOrder ?? existingOrder;

    // Chỉ gửi email khi DynamoDB vừa chuyển trạng thái sang REFUNDED.
    // Các lần query sau sẽ return sớm ở nhánh refundStatus === "REFUNDED".
    if (updatedOrder?.refundStatus === "REFUNDED") {
      await sendRefundCompletedEmail(updatedOrder);
    }

    return res.json({
      data: orderAfterSync,
      message: providerResult.returnMessage,
    });
  } catch (error) {
    if (error instanceof ZaloPayRefundError) {
      return res.status(502).json({
        message: error.message,
      });
    }

    console.error(error);

    return res.status(500).json({
      message: "Không thể truy vấn trạng thái hoàn tiền ZaloPay.",
    });
  }
});

app.get("/admin/orders/:orderId", async (req, res) => {
  try {
    const order = await getOrderById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    return res.json({
      data: order,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể lấy chi tiết đơn hàng.",
    });
  }
});

app.patch("/admin/orders/:orderId/shipping", async (req, res) => {
  try {
    const {
      shippingCarrier,
      shippingCarrierName,
      shippingTrackingCode,
    } = req.body as {
      shippingCarrier?: unknown;
      shippingCarrierName?: unknown;
      shippingTrackingCode?: unknown;
    };

    const validShippingCarriers: ShippingCarrier[] = [
      "GHN",
      "GHTK",
      "JNT",
      "VIETTEL_POST",
      "OTHER",
    ];

    if (
      typeof shippingCarrier !== "string" ||
      !validShippingCarriers.includes(shippingCarrier as ShippingCarrier)
    ) {
      return res.status(400).json({
        message: "Đơn vị giao hàng không hợp lệ.",
      });
    }

    if (
      typeof shippingTrackingCode !== "string" ||
      shippingTrackingCode.trim().length < 3 ||
      shippingTrackingCode.trim().length > 100
    ) {
      return res.status(400).json({
        message: "Mã vận đơn phải có từ 3 đến 100 ký tự.",
      });
    }

    const carrier = shippingCarrier as ShippingCarrier;

    const carrierName =
      typeof shippingCarrierName === "string"
        ? shippingCarrierName.trim()
        : "";

    if (carrier === "OTHER" && !carrierName) {
      return res.status(400).json({
        message: "Vui lòng nhập tên đơn vị giao hàng khác.",
      });
    }

    const existingOrder = await getOrderById(req.params.orderId);

    if (!existingOrder) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    if (existingOrder.orderStatus === "CANCELLED") {
      return res.status(409).json({
        message: "Không thể cập nhật vận chuyển cho đơn đã hủy.",
      });
    }

    if (existingOrder.orderStatus === "COMPLETED") {
      return res.status(409).json({
        message: "Không thể cập nhật vận chuyển cho đơn đã hoàn thành.",
      });
    }

    const updatedOrder = await updateOrderShipping({
      orderId: existingOrder.orderId,
      shippingCarrier: carrier,
      shippingCarrierName: carrierName,
      shippingTrackingCode: shippingTrackingCode.trim(),
    });

    if (!updatedOrder) {
      return res.status(500).json({
        message: "Không thể lưu thông tin vận chuyển.",
      });
    }

    await sendShippingUpdatedEmail(updatedOrder);

    return res.json({
      data: updatedOrder,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể cập nhật thông tin vận chuyển.",
    });
  }
});

app.patch("/admin/orders/:orderId/status", async (req, res) => {
  try {
    const { orderStatus } = req.body as {
      orderStatus?: OrderStatus;
    };

    const validStatuses: OrderStatus[] = [
      "PROCESSING",
      "SHIPPING",
      "COMPLETED",
      "CANCELLED",
    ];

    if (!orderStatus || !validStatuses.includes(orderStatus)) {
      return res.status(400).json({
        message: "Trạng thái đơn hàng không hợp lệ.",
      });
    }

    const existingOrder = await getOrderById(req.params.orderId);

    if (!existingOrder) {
      return res.status(404).json({
        message: "Không tìm thấy đơn hàng.",
      });
    }

    if (orderStatus === "CANCELLED") {
      if (existingOrder.orderStatus === "CANCELLED") {
        return res.status(409).json({
          message: "Đơn hàng đã được hủy trước đó.",
        });
      }

      if (
        existingOrder.orderStatus !== "PROCESSING" &&
        existingOrder.orderStatus !== "SHIPPING"
      ) {
        return res.status(409).json({
          message:
            "Chỉ có thể hủy đơn đang xử lý hoặc đang giao hàng.",
        });
      }

      try {
        await cancelOrderAndRestock(existingOrder);
      } catch (error) {
        if (error instanceof OrderCancellationError) {
          return res.status(400).json({
            message: error.message,
          });
        }

        if (
          error instanceof Error &&
          error.name === "TransactionCanceledException"
        ) {
          return res.status(409).json({
            message:
              "Đơn hàng hoặc tồn kho vừa được cập nhật. Hãy tải lại trang và kiểm tra lại.",
          });
        }

        throw error;
      }

      const cancelledOrder = await getOrderById(existingOrder.orderId);

      return res.json({
        data: cancelledOrder,
      });
    }

    if (existingOrder.orderStatus === "CANCELLED") {
      return res.status(409).json({
        message:
          "Không thể chuyển đơn đã hủy sang trạng thái khác vì tồn kho đã được hoàn lại.",
      });
    }

    const updatedOrder = await updateOrderStatus(
      req.params.orderId,
      orderStatus
    );

    return res.json({
      data: updatedOrder,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Không thể cập nhật trạng thái đơn hàng.",
    });
  }
});

app.post("/admin/uploads/product-image", async (req, res) => {
  try {
    const { fileName, contentType } = req.body as {
      fileName?: unknown;
      contentType?: unknown;
    };

    if (
      typeof fileName !== "string" ||
      !fileName.trim() ||
      typeof contentType !== "string" ||
      !contentType.trim()
    ) {
      return res.status(400).json({
        message: "Tên file và định dạng ảnh là bắt buộc.",
      });
    }

    const uploadData = await createProductImageUploadUrl({
      fileName,
      contentType,
    });

    return res.status(201).json({
      data: uploadData,
    });
  } catch (error) {
    console.error(error);

    if (error instanceof ProductImageUploadError) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Không thể tạo URL upload ảnh.",
    });
  }
});

// =========================
// Admin Product APIs
// =========================

app.get("/admin/products", async (req, res) => {
  try {
    const products = await listProducts();

    return res.json({
      data: products,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot get admin products",
    });
  }
});

app.post("/admin/products", async (req, res) => {
  try {
    const productInput = parseProductInput(req.body);

    if (!productInput) {
      return res.status(400).json({
        message: "Product information is required",
      });
    }

    const existingProduct = await getProductBySlug(productInput.slug);

    if (existingProduct) {
      return res.status(400).json({
        message: "Product slug already exists",
      });
    }

    const product = await createProduct(productInput);

    return res.status(201).json({
      data: product,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot create product",
    });
  }
});

app.put("/admin/products/:productId", async (req, res) => {
  try {
    const productInput = parseProductInput(req.body);

    if (!productInput) {
      return res.status(400).json({
        message: "Product information is required",
      });
    }

    const existingSlugProduct = await getProductBySlug(productInput.slug);

    if (
      existingSlugProduct &&
      existingSlugProduct.productId !== req.params.productId
    ) {
      return res.status(400).json({
        message: "Product slug already exists",
      });
    }

    const product = await updateProduct(req.params.productId, productInput);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    return res.json({
      data: product,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot update product",
    });
  }
});

app.delete("/admin/products/:productId", async (req, res) => {
  try {
    const product = await deleteProductById(req.params.productId);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    return res.json({
      data: product,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot delete product",
    });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT || 4000);

  app.listen(port, () => {
    console.log(`Backend running at http://localhost:${port}`);
  });
}