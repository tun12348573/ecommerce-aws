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

type SaveZaloPayPaymentSessionInput = {
  orderId: string;
  appTransId: string;
  orderUrl: string;
  expiresAt: string;
};

type MarkZaloPayOrderPaidInput = {
  orderId: string;
  appTransId: string;
  amount: number;
  transactionId: string;
  paidAt: string;
};

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
  const existingOrder = await getOrderById(orderId);

  if (!existingOrder) {
    return null;
  }

  const now = new Date().toISOString();

  const shouldMarkPaid =
    orderStatus === "COMPLETED" &&
    existingOrder.paymentStatus !== "PAID" &&
    (existingOrder.paymentMethod === "COD" ||
      existingOrder.paymentMethod === "BANK_TRANSFER");

  const updateParts = [
    "orderStatus = :orderStatus",
    "updatedAt = :updatedAt",
    "statusHistory = list_append(if_not_exists(statusHistory, :emptyStatusHistory), :newStatusHistory)",
  ];

  const expressionAttributeValues: Record<string, unknown> = {
    ":orderStatus": orderStatus,
    ":updatedAt": now,
    ":emptyStatusHistory": [],
    ":newStatusHistory": [
      {
        status: orderStatus,
        changedAt: now,
      },
    ],
  };

  if (shouldMarkPaid) {
    updateParts.push(
      "paymentStatus = :paymentStatus",
      "paidAt = :paidAt"
    );

    expressionAttributeValues[":paymentStatus"] = "PAID";
    expressionAttributeValues[":paidAt"] = now;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId,
      },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order | undefined) ?? null;
}

export async function saveZaloPayPaymentSession(
  input: SaveZaloPayPaymentSessionInput
): Promise<Order | null> {
  const updatedAt = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression:
        "SET #zalopayAppTransId = :appTransId, #zalopayOrderUrl = :orderUrl, #zalopayPaymentExpiresAt = :expiresAt, #updatedAt = :updatedAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #paymentMethod = :paymentMethod AND #paymentStatus = :paymentStatus AND attribute_not_exists(#zalopayAppTransId)",
      ExpressionAttributeNames: {
        "#paymentMethod": "paymentMethod",
        "#paymentStatus": "paymentStatus",
        "#zalopayAppTransId": "zalopayAppTransId",
        "#zalopayOrderUrl": "zalopayOrderUrl",
        "#zalopayPaymentExpiresAt": "zalopayPaymentExpiresAt",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":appTransId": input.appTransId,
        ":orderUrl": input.orderUrl,
        ":expiresAt": input.expiresAt,
        ":updatedAt": updatedAt,
        ":paymentMethod": "ZALOPAY",
        ":paymentStatus": "PENDING",
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order) || null;
}

export async function markZaloPayOrderPaid(
  input: MarkZaloPayOrderPaidInput
): Promise<Order | null> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression:
        "SET #paymentStatus = :paid, #paymentTransactionId = :transactionId, #paidAt = :paidAt, #updatedAt = :updatedAt REMOVE #zalopayOrderUrl, #zalopayPaymentExpiresAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #paymentMethod = :paymentMethod AND #paymentStatus = :pending AND #zalopayAppTransId = :appTransId AND #total = :amount",
      ExpressionAttributeNames: {
        "#paymentMethod": "paymentMethod",
        "#paymentStatus": "paymentStatus",
        "#paymentTransactionId": "paymentTransactionId",
        "#paidAt": "paidAt",
        "#updatedAt": "updatedAt",
        "#zalopayAppTransId": "zalopayAppTransId",
        "#zalopayOrderUrl": "zalopayOrderUrl",
        "#zalopayPaymentExpiresAt": "zalopayPaymentExpiresAt",
        "#total": "total",
      },
      ExpressionAttributeValues: {
        ":paymentMethod": "ZALOPAY",
        ":pending": "PENDING",
        ":paid": "PAID",
        ":appTransId": input.appTransId,
        ":amount": input.amount,
        ":transactionId": input.transactionId,
        ":paidAt": input.paidAt,
        ":updatedAt": input.paidAt,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order) || null;
}

