import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

type Product = {
  productId: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  salePrice: number;
  stock: number;
  image: string;
};

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

const products: Product[] = [
  {
    productId: "p001",
    name: "Áo thun basic",
    slug: "ao-thun-basic",
    category: "Thời trang",
    description: "Áo thun basic chất liệu cotton, phù hợp mặc hằng ngày.",
    price: 199000,
    salePrice: 159000,
    stock: 100,
    image: "https://placehold.co/600x600",
  },
  {
    productId: "p002",
    name: "Quần jean nam",
    slug: "quan-jean-nam",
    category: "Thời trang",
    description: "Quần jean nam form basic, dễ phối đồ.",
    price: 399000,
    salePrice: 349000,
    stock: 50,
    image: "https://placehold.co/600x600",
  },
  {
    productId: "p003",
    name: "Giày sneaker trắng",
    slug: "giay-sneaker-trang",
    category: "Giày dép",
    description:
      "Giày sneaker trắng phong cách tối giản, phù hợp đi học và đi chơi.",
    price: 599000,
    salePrice: 499000,
    stock: 30,
    image: "https://placehold.co/600x600",
  },
];

const orders: Order[] = [];

app.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    service: "ecommerce-backend",
    message: "Backend is running successfully",
  });
});

app.get("/products", (req, res) => {
  return res.json({
    data: products,
  });
});

app.get("/products/:slug", (req, res) => {
  const product = products.find((item) => item.slug === req.params.slug);

  if (!product) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

  return res.json({
    data: product,
  });
});

app.post("/orders", (req, res) => {
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

  for (const item of items) {
    const product = products.find(
      (productItem) => productItem.productId === item.productId
    );

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

  for (const item of orderItems) {
    const product = products.find(
      (productItem) => productItem.productId === item.productId
    );

    if (product) {
      product.stock = product.stock - item.quantity;
    }
  }

  return res.status(201).json({
    data: order,
  });
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

app.get("/admin/products", (req, res) => {
  return res.json({
    data: products,
  });
});

app.post("/admin/products", (req, res) => {
  const { name, slug, category, description, price, salePrice, stock, image } =
    req.body as Partial<Product>;

  if (
    !name ||
    !slug ||
    !category ||
    !description ||
    price === undefined ||
    salePrice === undefined ||
    stock === undefined
  ) {
    return res.status(400).json({
      message: "Product information is required",
    });
  }

  const existingProduct = products.find((product) => product.slug === slug);

  if (existingProduct) {
    return res.status(400).json({
      message: "Product slug already exists",
    });
  }

  const newProduct: Product = {
    productId: `p${Date.now()}`,
    name,
    slug,
    category,
    description,
    price: Number(price),
    salePrice: Number(salePrice),
    stock: Number(stock),
    image: image || "https://placehold.co/600x600",
  };

  products.push(newProduct);

  return res.status(201).json({
    data: newProduct,
  });
});

app.put("/admin/products/:productId", (req, res) => {
  const product = products.find(
    (item) => item.productId === req.params.productId
  );

  if (!product) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

  const { name, slug, category, description, price, salePrice, stock, image } =
    req.body as Partial<Product>;

  if (
    !name ||
    !slug ||
    !category ||
    !description ||
    price === undefined ||
    salePrice === undefined ||
    stock === undefined
  ) {
    return res.status(400).json({
      message: "Product information is required",
    });
  }

  const existingSlug = products.find(
    (item) => item.slug === slug && item.productId !== product.productId
  );

  if (existingSlug) {
    return res.status(400).json({
      message: "Product slug already exists",
    });
  }

  product.name = name;
  product.slug = slug;
  product.category = category;
  product.description = description;
  product.price = Number(price);
  product.salePrice = Number(salePrice);
  product.stock = Number(stock);
  product.image = image || "https://placehold.co/600x600";

  return res.json({
    data: product,
  });
});

app.delete("/admin/products/:productId", (req, res) => {
  const productIndex = products.findIndex(
    (item) => item.productId === req.params.productId
  );

  if (productIndex === -1) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

  const deletedProduct = products.splice(productIndex, 1)[0];

  return res.json({
    data: deletedProduct,
  });
});

const port = 4000;

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});