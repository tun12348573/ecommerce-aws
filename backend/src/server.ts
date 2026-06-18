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
import type { ProductInput } from "./types/product";

const app = express();

app.use(cors());
app.use(express.json());

type OrderItem = {
  productId: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number;
  quantity: number;
};

type CustomerInfo = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  note?: string;
};

type Order = {
  orderId: string;
  customer: CustomerInfo;
  items: OrderItem[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  paymentMethod: "COD" | "BANK_TRANSFER";
  paymentStatus: "PENDING" | "PAID";
  orderStatus: "PROCESSING" | "SHIPPING" | "COMPLETED" | "CANCELLED";
  createdAt: string;
};

const orders: Order[] = [];

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
      paymentMethod?: "COD" | "BANK_TRANSFER";
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
    const checkedProducts: Array<{
      productId: string;
      quantity: number;
      nextStock: number;
      input: ProductInput;
    }> = [];

    for (const item of items) {
      const product = await getProductById(item.productId);

      if (!product) {
        return res.status(404).json({
          message: `Product ${item.productId} not found`,
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

      checkedProducts.push({
        productId: product.productId,
        quantity: item.quantity,
        nextStock: product.stock - item.quantity,
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
      createdAt: new Date().toISOString(),
    };

    orders.push(order);

    for (const item of checkedProducts) {
      await updateProduct(item.productId, item.input);
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

app.get("/orders", (req, res) => {
  return res.json({
    data: orders,
  });
});

app.get("/orders/:orderId", (req, res) => {
  const order = orders.find((item) => item.orderId === req.params.orderId);

  if (!order) {
    return res.status(404).json({
      message: "Order not found",
    });
  }

  return res.json({
    data: order,
  });
});

app.get("/admin/orders", (req, res) => {
  return res.json({
    data: orders,
  });
});

app.patch("/admin/orders/:orderId/status", (req, res) => {
  const { orderStatus } = req.body as {
    orderStatus?: Order["orderStatus"];
  };

  const validStatuses: Order["orderStatus"][] = [
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

  const order = orders.find((item) => item.orderId === req.params.orderId);

  if (!order) {
    return res.status(404).json({
      message: "Order not found",
    });
  }

  order.orderStatus = orderStatus;

  return res.json({
    data: order,
  });
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