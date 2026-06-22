import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  createProduct,
  deleteProductById,
  getProductById,
  getProductBySlug,
  listProducts,
  updateProduct,
} from "./repositories/product.repository";
import {
  createOrder,
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

const app = express();

app.use(cors());
app.use(express.json());

function parseProductInput(body: Partial<ProductInput>): ProductInput | null {
  const { name, slug, category, description, price, salePrice, stock, image } =
    body;

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

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    service: "ecommerce-backend",
    database: "DynamoDB",
    message: "Backend is running successfully",
  });
});

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

app.post("/orders", async (req, res) => {
  try {
    const { items, customer, paymentMethod } = req.body as {
      items?: Array<{
        productId: string;
        quantity: number;
      }>;
      customer?: CustomerInfo;
      paymentMethod?: PaymentMethod;
    };

    if (!items || items.length === 0) {
      return res.status(400).json({
        message: "Cart is empty",
      });
    }

    if (
      !customer ||
      !customer.fullName ||
      !customer.phone ||
      !customer.email ||
      !customer.address
    ) {
      return res.status(400).json({
        message: "Customer information is required",
      });
    }

    const orderItems: OrderItem[] = [];

    const productsToUpdate: Array<{
      productId: string;
      input: ProductInput;
    }> = [];

    for (const item of items) {
      const product = await getProductById(item.productId);

      if (!product) {
        return res.status(404).json({
          message: `Product ${item.productId} not found`,
        });
      }

      if (item.quantity <= 0) {
        return res.status(400).json({
          message: "Invalid product quantity",
        });
      }

      if (item.quantity > product.stock) {
        return res.status(400).json({
          message: `${product.name} is out of stock`,
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

      productsToUpdate.push({
        productId: product.productId,
        input: {
          name: product.name,
          slug: product.slug,
          category: product.category,
          description: product.description,
          price: product.price,
          salePrice: product.salePrice,
          stock: product.stock - item.quantity,
          image: product.image,
        },
      });
    }

    const subtotal = orderItems.reduce((total, item) => {
      return total + item.salePrice * item.quantity;
    }, 0);

    const shippingFee = 30000;
    const discount = 0;
    const total = subtotal + shippingFee - discount;
    const now = new Date().toISOString();

    const order: Order = {
      orderId: `ord_${Date.now()}`,
      customer,
      items: orderItems,
      subtotal,
      shippingFee,
      discount,
      total,
      paymentMethod: paymentMethod || "COD",
      paymentStatus: "PENDING",
      orderStatus: "PROCESSING",
      createdAt: now,
      updatedAt: now,
    };

    await createOrder(order);

    for (const product of productsToUpdate) {
      await updateProduct(product.productId, product.input);
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

app.get("/orders", async (req, res) => {
  try {
    const orders = await listOrders();

    return res.json({
      data: orders,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot get orders",
    });
  }
});

app.get("/orders/:orderId", async (req, res) => {
  try {
    const order = await getOrderById(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    return res.json({
      data: order,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Cannot get order",
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

const port = 4000;

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});