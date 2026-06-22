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
  updateOrderStatus,
} from "./repositories/order.repository";

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

    const paymentMethod: PaymentMethod =
      body.paymentMethod === "BANK_TRANSFER" ? "BANK_TRANSFER" : "COD";

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
        message: "Invalid order status",
      });
    }

    const existingOrder = await getOrderById(req.params.orderId);

    if (!existingOrder) {
      return res.status(404).json({
        message: "Order not found",
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
      message: "Cannot update order status",
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



