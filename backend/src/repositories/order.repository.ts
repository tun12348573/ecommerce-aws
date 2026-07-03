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
  RefundStatus,
  ShippingCarrier,
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

type UpdateOrderShippingInput = {
  orderId: string;
  shippingCarrier: ShippingCarrier;
  shippingCarrierName?: string;
  shippingTrackingCode: string;
};


type BeginZaloPayRefundInput = {
  orderId: string;
  merchantRefundId: string;
  amount: number;
  reason: string;
};

type MarkZaloPayRefundPendingInput = {
  orderId: string;
  merchantRefundId: string;
  providerRefundId?: string;
  providerMessage: string;
};

type MarkZaloPayRefundFailedInput = {
  orderId: string;
  merchantRefundId: string;
  message: string;
};

type SyncZaloPayRefundStatusInput = {
  orderId: string;
  merchantRefundId: string;
  status: Extract<RefundStatus, "PENDING" | "REFUNDED" | "FAILED">;
  providerRefundId?: string;
  providerMessage: string;
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

export async function listOrdersByCustomerUserId(
  customerUserId: string
): Promise<Order[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getOrdersTableName(),
      FilterExpression: "#customerUserId = :customerUserId",
      ExpressionAttributeNames: {
        "#customerUserId": "customerUserId",
      },
      ExpressionAttributeValues: {
        ":customerUserId": customerUserId,
      },
    })
  );

  const orders = (result.Items ?? []) as Order[];

  return orders.sort((first, second) => {
    return (
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime()
    );
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

export async function updateOrderShipping(
  input: UpdateOrderShippingInput
): Promise<Order | null> {
  const existingOrder = await getOrderById(input.orderId);

  if (!existingOrder) {
    return null;
  }

  const now = new Date().toISOString();

  const setParts = [
    "#shippingCarrier = :shippingCarrier",
    "#shippingCarrierName = :shippingCarrierName",
    "#shippingTrackingCode = :shippingTrackingCode",
    "#orderStatus = :shippingStatus",
    "#updatedAt = :updatedAt",
  ];

  const expressionAttributeNames: Record<string, string> = {
    "#shippingCarrier": "shippingCarrier",
    "#shippingCarrierName": "shippingCarrierName",
    "#shippingTrackingCode": "shippingTrackingCode",
    "#orderStatus": "orderStatus",
    "#updatedAt": "updatedAt",
  };

  const expressionAttributeValues: Record<string, unknown> = {
    ":shippingCarrier": input.shippingCarrier,
    ":shippingCarrierName":
      input.shippingCarrier === "OTHER"
        ? input.shippingCarrierName?.trim() || ""
        : "",
    ":shippingTrackingCode": input.shippingTrackingCode.trim(),
    ":shippingStatus": "SHIPPING",
    ":updatedAt": now,
  };

  if (existingOrder.orderStatus !== "SHIPPING") {
    setParts.push(
      "#shippedAt = :shippedAt",
      "#statusHistory = list_append(if_not_exists(#statusHistory, :emptyStatusHistory), :shippingStatusHistory)"
    );

    expressionAttributeNames["#shippedAt"] = "shippedAt";
    expressionAttributeNames["#statusHistory"] = "statusHistory";

    expressionAttributeValues[":shippedAt"] = now;
    expressionAttributeValues[":emptyStatusHistory"] = [];
    expressionAttributeValues[":shippingStatusHistory"] = [
      {
        status: "SHIPPING",
        changedAt: now,
      },
    ];
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression: `SET ${setParts.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order | undefined) ?? null;
}

/**
 * Creates a durable refund lock before the external ZaloPay API is called.
 * This prevents two admin clicks from creating two refund requests.
 */
export async function beginZaloPayRefund(
  input: BeginZaloPayRefundInput
): Promise<Order | null> {
  const now = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression:
        "SET #refundStatus = :requesting, #refundAmount = :amount, #refundReason = :reason, #refundMerchantId = :merchantRefundId, #refundRequestedAt = :requestedAt, #refundLastCheckedAt = :requestedAt, #refundLastMessage = :message, #updatedAt = :updatedAt REMOVE #refundZaloPayId, #refundCompletedAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #paymentMethod = :paymentMethod AND #paymentStatus = :paymentStatus AND #orderStatus = :orderStatus AND (attribute_not_exists(#refundStatus) OR #refundStatus = :failed)",
      ExpressionAttributeNames: {
        "#paymentMethod": "paymentMethod",
        "#paymentStatus": "paymentStatus",
        "#orderStatus": "orderStatus",
        "#refundStatus": "refundStatus",
        "#refundAmount": "refundAmount",
        "#refundReason": "refundReason",
        "#refundMerchantId": "refundMerchantId",
        "#refundRequestedAt": "refundRequestedAt",
        "#refundLastCheckedAt": "refundLastCheckedAt",
        "#refundLastMessage": "refundLastMessage",
        "#refundZaloPayId": "refundZaloPayId",
        "#refundCompletedAt": "refundCompletedAt",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":paymentMethod": "ZALOPAY",
        ":paymentStatus": "PAID",
        ":orderStatus": "CANCELLED",
        ":requesting": "REQUESTING",
        ":failed": "FAILED",
        ":amount": input.amount,
        ":reason": input.reason,
        ":merchantRefundId": input.merchantRefundId,
        ":requestedAt": now,
        ":message": "Đang khởi tạo yêu cầu hoàn tiền với ZaloPay.",
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order | undefined) ?? null;
}

export async function markZaloPayRefundPending(
  input: MarkZaloPayRefundPendingInput
): Promise<Order | null> {
  const now = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression:
        "SET #refundStatus = :pending, #refundLastCheckedAt = :checkedAt, #refundLastMessage = :message, #refundZaloPayId = :providerRefundId, #updatedAt = :updatedAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #refundMerchantId = :merchantRefundId AND #refundStatus = :requesting",
      ExpressionAttributeNames: {
        "#refundStatus": "refundStatus",
        "#refundMerchantId": "refundMerchantId",
        "#refundLastCheckedAt": "refundLastCheckedAt",
        "#refundLastMessage": "refundLastMessage",
        "#refundZaloPayId": "refundZaloPayId",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":pending": "PENDING",
        ":requesting": "REQUESTING",
        ":merchantRefundId": input.merchantRefundId,
        ":checkedAt": now,
        ":message": input.providerMessage,
        ":providerRefundId": input.providerRefundId ?? "",
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order | undefined) ?? null;
}

export async function markZaloPayRefundFailed(
  input: MarkZaloPayRefundFailedInput
): Promise<Order | null> {
  const now = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression:
        "SET #refundStatus = :failed, #refundLastCheckedAt = :checkedAt, #refundLastMessage = :message, #updatedAt = :updatedAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #refundMerchantId = :merchantRefundId AND #refundStatus = :requesting",
      ExpressionAttributeNames: {
        "#refundStatus": "refundStatus",
        "#refundMerchantId": "refundMerchantId",
        "#refundLastCheckedAt": "refundLastCheckedAt",
        "#refundLastMessage": "refundLastMessage",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":failed": "FAILED",
        ":requesting": "REQUESTING",
        ":merchantRefundId": input.merchantRefundId,
        ":checkedAt": now,
        ":message": input.message,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order | undefined) ?? null;
}

export async function syncZaloPayRefundStatus(
  input: SyncZaloPayRefundStatusInput
): Promise<Order | null> {
  const now = new Date().toISOString();

  const updateParts = [
    "#refundStatus = :refundStatus",
    "#refundLastCheckedAt = :checkedAt",
    "#refundLastMessage = :message",
    "#refundZaloPayId = :providerRefundId",
    "#updatedAt = :updatedAt",
  ];

  const expressionAttributeNames: Record<string, string> = {
    "#refundStatus": "refundStatus",
    "#refundMerchantId": "refundMerchantId",
    "#refundLastCheckedAt": "refundLastCheckedAt",
    "#refundLastMessage": "refundLastMessage",
    "#refundZaloPayId": "refundZaloPayId",
    "#updatedAt": "updatedAt",
  };

  const expressionAttributeValues: Record<string, unknown> = {
    ":refundStatus": input.status,
    ":merchantRefundId": input.merchantRefundId,
    ":checkedAt": now,
    ":message": input.providerMessage,
    ":providerRefundId": input.providerRefundId ?? "",
    ":updatedAt": now,
    ":requesting": "REQUESTING",
    ":pending": "PENDING",
    ":failed": "FAILED",
  };

  if (input.status === "REFUNDED") {
    updateParts.push("#refundCompletedAt = :completedAt");
    expressionAttributeNames["#refundCompletedAt"] = "refundCompletedAt";
    expressionAttributeValues[":completedAt"] = now;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ConditionExpression:
        "attribute_exists(orderId) AND #refundMerchantId = :merchantRefundId AND #refundStatus IN (:requesting, :pending, :failed)",
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order | undefined) ?? null;
}

