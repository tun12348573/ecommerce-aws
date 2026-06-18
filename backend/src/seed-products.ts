import "dotenv/config";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, getProductsTableName } from "./shared/dynamodb";
import type { Product } from "./types/product";

const now = new Date().toISOString();

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
    createdAt: now,
    updatedAt: now,
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
    createdAt: now,
    updatedAt: now,
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
    createdAt: now,
    updatedAt: now,
  },
];

async function main() {
  const tableName = getProductsTableName();

  for (const product of products) {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: product,
      })
    );

    console.log(`Seeded product: ${product.name}`);
  }

  await docClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: {
        productId: "test_001",
      },
    })
  );

  console.log("Removed test product: test_001");
  console.log("Seed products completed.");
}

main().catch((error) => {
  console.error("Seed products failed:");
  console.error(error);
  process.exit(1);
});