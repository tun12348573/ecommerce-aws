import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, getProductsTableName } from "../shared/dynamodb";
import type { Product, ProductInput } from "../types/product";

export async function listProducts(): Promise<Product[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getProductsTableName(),
    })
  );

  return (result.Items || []) as Product[];
}

export async function getProductById(
  productId: string
): Promise<Product | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getProductsTableName(),
      Key: {
        productId,
      },
    })
  );

  return (result.Item as Product) || null;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: getProductsTableName(),
      IndexName: "SlugIndex",
      KeyConditionExpression: "#slug = :slug",
      ExpressionAttributeNames: {
        "#slug": "slug",
      },
      ExpressionAttributeValues: {
        ":slug": slug,
      },
      Limit: 1,
    })
  );

  const item = result.Items?.[0];

  return (item as Product) || null;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const now = new Date().toISOString();

  const product: Product = {
    productId: `p_${Date.now()}`,
    name: input.name,
    slug: input.slug,
    category: input.category,
    description: input.description,
    price: Number(input.price),
    salePrice: Number(input.salePrice),
    stock: Number(input.stock),
    image: input.image || "https://placehold.co/600x600",
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: getProductsTableName(),
      Item: product,
      ConditionExpression: "attribute_not_exists(productId)",
    })
  );

  return product;
}

export async function updateProduct(
  productId: string,
  input: ProductInput
): Promise<Product | null> {
  const existingProduct = await getProductById(productId);

  if (!existingProduct) {
    return null;
  }

  const updatedProduct: Product = {
    ...existingProduct,
    name: input.name,
    slug: input.slug,
    category: input.category,
    description: input.description,
    price: Number(input.price),
    salePrice: Number(input.salePrice),
    stock: Number(input.stock),
    image: input.image || "https://placehold.co/600x600",
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: getProductsTableName(),
      Item: updatedProduct,
    })
  );

  return updatedProduct;
}

export async function deleteProductById(
  productId: string
): Promise<Product | null> {
  const existingProduct = await getProductById(productId);

  if (!existingProduct) {
    return null;
  }

  await docClient.send(
    new DeleteCommand({
      TableName: getProductsTableName(),
      Key: {
        productId,
      },
    })
  );

  return existingProduct;
}