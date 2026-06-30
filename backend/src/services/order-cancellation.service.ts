import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

import type { Order, OrderStatusHistoryItem } from "../types/order";

const documentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.AWS_REGION,
  })
);

export class OrderCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderCancellationError";
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new OrderCancellationError(`${name} is missing.`);
  }

  return value;
}

function getProductQuantities(order: Order): Map<string, number> {
  const quantities = new Map<string, number>();

  if (!Array.isArray(order.items) || order.items.length === 0) {
    throw new OrderCancellationError(
      "Đơn hàng không có sản phẩm để hoàn tồn kho."
    );
  }

  for (const item of order.items) {
    if (
      !item ||
      typeof item.productId !== "string" ||
      !item.productId.trim() ||
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new OrderCancellationError(
        "Dữ liệu sản phẩm trong đơn hàng không hợp lệ."
      );
    }

    const currentQuantity = quantities.get(item.productId) || 0;

    quantities.set(item.productId, currentQuantity + item.quantity);
  }

  return quantities;
}

export async function cancelOrderAndRestock(order: Order): Promise<void> {
  if (!order.orderId?.trim()) {
    throw new OrderCancellationError("Mã đơn hàng không hợp lệ.");
  }

  const ordersTableName = getRequiredEnv("ORDERS_TABLE");
  const productsTableName = getRequiredEnv("PRODUCTS_TABLE");

  const productQuantities = getProductQuantities(order);

  if (productQuantities.size + 1 > 100) {
    throw new OrderCancellationError(
      "Đơn hàng có quá nhiều sản phẩm để xử lý trong một giao dịch."
    );
  }

  const updatedAt = new Date().toISOString();

  const historyItem: OrderStatusHistoryItem = {
    status: "CANCELLED",
    changedAt: updatedAt,
  };

  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: ordersTableName,
            Key: {
              orderId: order.orderId,
            },
            UpdateExpression:
              "SET #orderStatus = :cancelled, #updatedAt = :updatedAt, #statusHistory = list_append(if_not_exists(#statusHistory, :emptyHistory), :newStatusHistory)",
            ConditionExpression:
              "attribute_exists(orderId) AND #orderStatus IN (:processing, :shipping)",
            ExpressionAttributeNames: {
              "#orderStatus": "orderStatus",
              "#updatedAt": "updatedAt",
              "#statusHistory": "statusHistory",
            },
            ExpressionAttributeValues: {
              ":cancelled": "CANCELLED",
              ":processing": "PROCESSING",
              ":shipping": "SHIPPING",
              ":updatedAt": updatedAt,
              ":emptyHistory": [],
              ":newStatusHistory": [historyItem],
            },
          },
        },

        ...Array.from(productQuantities.entries()).map(
          ([productId, quantity]) => ({
            Update: {
              TableName: productsTableName,
              Key: {
                productId,
              },
              UpdateExpression:
                "SET stock = stock + :quantity, updatedAt = :updatedAt",
              ConditionExpression: "attribute_exists(productId)",
              ExpressionAttributeValues: {
                ":quantity": quantity,
                ":updatedAt": updatedAt,
              },
            },
          })
        ),
      ],
    })
  );
}

