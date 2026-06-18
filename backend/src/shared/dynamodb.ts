import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export function getProductsTableName() {
  const tableName = process.env.PRODUCTS_TABLE;

  if (!tableName) {
    throw new Error("PRODUCTS_TABLE is missing in .env");
  }

  return tableName;
}

export function getOrdersTableName() {
  const tableName = process.env.ORDERS_TABLE;

  if (!tableName) {
    throw new Error("ORDERS_TABLE is missing in .env");
  }

  return tableName;
}