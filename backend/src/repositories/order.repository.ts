import {
  GetCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  docClient,
  getOrdersTableName,
  getProductsTableName,
} from "../shared/dynamodb";

import type {
  Order,
  OrderStatus,
  OrderStatusHistoryItem,
} from "../types/order";

export async function listOrders(): Promise<Order[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getOrdersTableName(),
    })
  );

  const orders = (result.Items ?? []) as Order[];

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

export async function createOrderAndDecrementStock(
  order: Order
): Promise<void> {
  const ordersTableName = getOrdersTableName();
  const productsTableName = getProductsTableName();

  await docClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: ordersTableName,
            Item: order,
            ConditionExpression: "attribute_not_exists(orderId)",
          },
        },

        ...order.items.map((item) => ({
          Update: {
            TableName: productsTableName,
            Key: {
              productId: item.productId,
            },
            UpdateExpression:
              "SET #stock = #stock - :quantity, #updatedAt = :updatedAt",
            ConditionExpression:
              "attribute_exists(productId) AND #stock >= :quantity",
            ExpressionAttributeNames: {
              "#stock": "stock",
              "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues: {
              ":quantity": item.quantity,
              ":updatedAt": order.updatedAt,
            },
          },
        })),
      ],
    })
  );
}

export async function updateOrderStatus(
  orderId: string,
  orderStatus: OrderStatus
): Promise<Order | null> {
  const changedAt = new Date().toISOString();

  const historyItem: OrderStatusHistoryItem = {
    status: orderStatus,
    changedAt,
  };

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId,
      },
      UpdateExpression:
        "SET #orderStatus = :orderStatus, #updatedAt = :updatedAt, #statusHistory = list_append(if_not_exists(#statusHistory, :emptyHistory), :newStatusHistory)",
      ConditionExpression: "attribute_exists(orderId)",
      ExpressionAttributeNames: {
        "#orderStatus": "orderStatus",
        "#updatedAt": "updatedAt",
        "#statusHistory": "statusHistory",
      },
      ExpressionAttributeValues: {
        ":orderStatus": orderStatus,
        ":updatedAt": changedAt,
        ":emptyHistory": [],
        ":newStatusHistory": [historyItem],
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order) || null;
}

