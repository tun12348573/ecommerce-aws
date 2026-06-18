import "dotenv/config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
});

const docClient = DynamoDBDocumentClient.from(client);

async function main() {
  const tableName = process.env.PRODUCTS_TABLE;

  if (!tableName) {
    throw new Error("PRODUCTS_TABLE is missing in .env");
  }

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        productId: "test_001",
        slug: "san-pham-test",
        name: "Sản phẩm test DynamoDB",
        category: "Test",
        description: "Sản phẩm dùng để kiểm tra kết nối DynamoDB thật.",
        price: 100000,
        salePrice: 90000,
        stock: 10,
        image: "https://placehold.co/600x600",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
  );

  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName,
    })
  );

  console.log("DynamoDB connected successfully!");
  console.log(result.Items);
}

main().catch((error) => {
  console.error("DynamoDB test failed:");
  console.error(error);
  process.exit(1);
});