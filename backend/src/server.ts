import "dotenv/config";
import { randomUUID } from "node:crypto";

import cors from "cors";
import express from "express";

import {
  createProductImageUploadUrl,
  ProductImageUploadError,
} from "./services/product-image-upload.service";

import {
  createProduct,
  deleteProductById,
  getProductById,
  getProductBySlug,
  listProducts,
  updateProduct,
} from "./repositories/product.repository";

import {
  createOrderAndDecrementStock,
  getOrderById,
  listOrders,
  markZaloPayOrderPaid,
  saveZaloPayPaymentSession,
  updateOrderStatus,
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

import type { ProductInput } from "./types/product";
import type {
  CustomerInfo,
  Order,
  OrderItem,
  OrderStatus,
  PaymentMethod,
} from "./types/order";

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

app.post("/orders", async (req, res) => {
  try {
    const body = req.body as {
      items?: unknown;
      customer?: CustomerInfo;
      paymentMethod?: PaymentMethod;
    };

    const checkoutItems = normalizeCheckoutItems(body.items);

    if (!checkoutItems) {
      return res.status(400).json({
        message: "Cart is empty or invalid",
      });
    }

    const customer = body.customer;

    if (
      !customer ||
      !customer.fullName?.trim() ||
      !customer.phone?.trim() ||
      !customer.email?.trim() ||
      !customer.address?.trim()
    ) {
      return res.status(400).json({
        message: "Customer information is required",
      });
    }

    const orderItems: OrderItem[] = [];

    for (const item of checkoutItems) {
      const product = await getProductById(item.productId);

      if (!product) {
        return res.status(404).json({
          message: `Product ${item.productId} not found`,
        });
      }

      if (item.quantity > product.stock) {
        return res.status(409).json({
          message: `${product.name} does not have enough stock`,
        });
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

    let paymentMethod: PaymentMethod = "COD";

if (body.paymentMethod !== undefined) {
  if (
    body.paymentMethod !== "COD" &&
    body.paymentMethod !== "BANK_TRANSFER" &&
    body.paymentMethod !== "ZALOPAY"
  ) {
    return res.status(400).json({
      message: "Phương thức thanh toán không hợp lệ.",
    });
  }

  paymentMethod = body.paymentMethod;
}

    const order: Order = {
      orderId: `ord_${randomUUID()}`,
      customer,
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
        return res.status(409).json({
          message:
            "Không thể tạo đơn hàng vì tồn kho vừa thay đổi. Hãy kiểm tra lại giỏ hàng.",
        });
      }

      throw error;
    }

    return res.status(201).json({
      data: order,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot create order",
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
      await markZaloPayOrderPaid({
        orderId: order.orderId,
        appTransId: callback.app_trans_id,
        amount: callback.amount,
        transactionId: String(callback.zp_trans_id),
        paidAt: new Date(callback.server_time).toISOString(),
      });
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

    try {
      updatedOrder = await markZaloPayOrderPaid({
        orderId: order.orderId,
        appTransId: order.zalopayAppTransId,
        amount: queryResult.amount,
        transactionId: queryResult.transactionId,
        paidAt: queryResult.paidAt,
      });
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