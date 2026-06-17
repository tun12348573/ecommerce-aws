import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const products = [
  {
    productId: "p001",
    name: "Áo thun basic AWS",
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

const port = 4000;

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});