import {
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, getOrdersTableName } from "../shared/dynamodb";
import type { Order, OrderStatus } from "../types/order";

export async function listOrders(): Promise<Order[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getOrdersTableName(),
    })
  );

  const orders = (result.Items || []) as Order[];

  return orders.sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId,
      },
    })
  );

  return (result.Item as Order) || null;
}

export async function createOrder(order: Order): Promise<Order> {
  await docClient.send(
    new PutCommand({
      TableName: getOrdersTableName(),
      Item: order,
      ConditionExpression: "attribute_not_exists(orderId)",
    })
  );

  return order;
}

export async function updateOrderStatus(
  orderId: string,
  orderStatus: OrderStatus
): Promise<Order | null> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId,
      },
      UpdateExpression: "SET orderStatus = :orderStatus, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":orderStatus": orderStatus,
        ":updatedAt": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order) || null;
}