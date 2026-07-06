import {
  GetCommand,
  QueryCommand,
  type QueryCommandInput,
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

type RecordZaloPayRefundCheckInput = {
  orderId: string;
  merchantRefundId: string;
  message: string;
};

const ORDERS_BY_CUSTOMER_INDEX = "OrdersByCustomerIndex";
const REFUNDS_BY_STATUS_INDEX = "RefundsByStatusIndex";
const PENDING_PAYMENT_BY_EXPIRY_INDEX = "PendingPaymentByExpiryIndex";

const REFUND_STATUSES: RefundStatus[] = [
  "REQUESTING",
  "PENDING",
  "REFUNDED",
  "FAILED",
];

function sortOrdersNewestFirst(orders: Order[]): Order[] {
  return [...orders].sort((first, second) => {
    return (
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime()
    );
  });
}

async function queryOrdersByCustomerUserId(
  customerUserId: string
): Promise<Order[]> {
  const orders: Order[] = [];
  let exclusiveStartKey: QueryCommandInput["ExclusiveStartKey"];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: getOrdersTableName(),
        IndexName: ORDERS_BY_CUSTOMER_INDEX,
        KeyConditionExpression: "#customerUserId = :customerUserId",
        ExpressionAttributeNames: {
          "#customerUserId": "customerUserId",
        },
        ExpressionAttributeValues: {
          ":customerUserId": customerUserId,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    orders.push(...((result.Items ?? []) as Order[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return orders;
}

async function queryRefundOrdersByStatus(
  refundStatus: RefundStatus
): Promise<Order[]> {
  const orders: Order[] = [];
  let exclusiveStartKey: QueryCommandInput["ExclusiveStartKey"];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: getOrdersTableName(),
        IndexName: REFUNDS_BY_STATUS_INDEX,
        KeyConditionExpression: "#refundStatus = :refundStatus",
        ExpressionAttributeNames: {
          "#refundStatus": "refundStatus",
        },
        ExpressionAttributeValues: {
          ":refundStatus": refundStatus,
        },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    orders.push(...((result.Items ?? []) as Order[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return orders;
}

export async function listExpiredZaloPayPaymentOrders(input: {
  expiresBefore: string;
  limit: number;
}): Promise<Order[]> {
  const requestedLimit = Number.isInteger(input.limit)
    ? input.limit
    : 20;

  const safeLimit = Math.min(Math.max(requestedLimit, 1), 50);

  const result = await docClient.send(
    new QueryCommand({
      TableName: getOrdersTableName(),
      IndexName: PENDING_PAYMENT_BY_EXPIRY_INDEX,
      KeyConditionExpression:
        "#pendingPaymentStatus = :awaitingPayment AND #expiresAt <= :expiresBefore",
      ExpressionAttributeNames: {
        "#pendingPaymentStatus": "pendingPaymentStatus",
        "#expiresAt": "zalopayPaymentExpiresAt",
      },
      ExpressionAttributeValues: {
        ":awaitingPayment": "AWAITING_PAYMENT",
        ":expiresBefore": input.expiresBefore,
      },
      ScanIndexForward: true,
      Limit: safeLimit,
    })
  );

  return (result.Items ?? []) as Order[];
}

export async function listOrders(): Promise<Order[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: getOrdersTableName(),
    })
  );

  return sortOrdersNewestFirst((result.Items ?? []) as Order[]);
}

export async function listZaloPayRefundOrders(
  refundStatus?: RefundStatus
): Promise<Order[]> {
  const statuses = refundStatus ? [refundStatus] : REFUND_STATUSES;

  const resultGroups = await Promise.all(
    statuses.map((status) => queryRefundOrdersByStatus(status))
  );

  const orders = resultGroups.flat();

  return sortOrdersNewestFirst(
    orders.filter(
      (order) =>
        order.paymentMethod === "ZALOPAY" &&
        order.refundStatus !== undefined
    )
  );
}

export async function listActiveZaloPayRefundOrders(): Promise<Order[]> {
  const resultGroups = await Promise.all([
    queryRefundOrdersByStatus("REQUESTING"),
    queryRefundOrdersByStatus("PENDING"),
  ]);

  return sortOrdersNewestFirst(
    resultGroups
      .flat()
      .filter((order) => order.paymentMethod === "ZALOPAY")
  );
}

export async function listOrdersByCustomerUserId(
  customerUserId: string
): Promise<Order[]> {
  return queryOrdersByCustomerUserId(customerUserId);
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

  let expectedOrderStatus: OrderStatus;

  switch (orderStatus) {
    case "SHIPPING":
      expectedOrderStatus = "PROCESSING";
      break;
    case "COMPLETED":
      expectedOrderStatus = "SHIPPING";
      break;
    default:
      throw new Error(
        "updateOrderStatus chỉ hỗ trợ luồng PROCESSING → SHIPPING → COMPLETED."
      );
  }

  const now = new Date().toISOString();

  const shouldMarkPaid =
    orderStatus === "COMPLETED" &&
    existingOrder.paymentStatus !== "PAID" &&
    (existingOrder.paymentMethod === "COD" ||
      existingOrder.paymentMethod === "BANK_TRANSFER");

  const updateParts = [
    "#orderStatus = :orderStatus",
    "#updatedAt = :updatedAt",
    "#statusHistory = list_append(if_not_exists(#statusHistory, :emptyStatusHistory), :newStatusHistory)",
  ];

  const expressionAttributeNames: Record<string, string> = {
    "#orderStatus": "orderStatus",
    "#updatedAt": "updatedAt",
    "#statusHistory": "statusHistory",
    "#paymentMethod": "paymentMethod",
    "#paymentStatus": "paymentStatus",
  };

  const expressionAttributeValues: Record<string, unknown> = {
    ":orderStatus": orderStatus,
    ":expectedOrderStatus": expectedOrderStatus,
    ":updatedAt": now,
    ":emptyStatusHistory": [],
    ":newStatusHistory": [
      {
        status: orderStatus,
        changedAt: now,
      },
    ],
    ":zalopay": "ZALOPAY",
    ":paid": "PAID",
  };

  if (shouldMarkPaid) {
    updateParts.push(
      "#paymentStatus = :completedPaymentStatus",
      "#paidAt = :paidAt"
    );

    expressionAttributeNames["#paidAt"] = "paidAt";

    expressionAttributeValues[":completedPaymentStatus"] = "PAID";
    expressionAttributeValues[":paidAt"] = now;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId,
      },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ConditionExpression:
        "attribute_exists(orderId) AND #orderStatus = :expectedOrderStatus AND (#paymentMethod <> :zalopay OR #paymentStatus = :paid)",
      ExpressionAttributeNames: expressionAttributeNames,
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
        "SET #pendingPaymentStatus = :awaitingPayment, #zalopayAppTransId = :appTransId, #zalopayOrderUrl = :orderUrl, #zalopayPaymentExpiresAt = :expiresAt, #updatedAt = :updatedAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #paymentMethod = :paymentMethod AND #paymentStatus = :paymentStatus AND #orderStatus = :processing AND attribute_not_exists(#zalopayAppTransId) AND (attribute_not_exists(#pendingPaymentStatus) OR #pendingPaymentStatus = :awaitingPayment) AND (attribute_not_exists(#zalopayPaymentExpiresAt) OR #zalopayPaymentExpiresAt > :updatedAt)",
      ExpressionAttributeNames: {
        "#pendingPaymentStatus": "pendingPaymentStatus",
        "#paymentMethod": "paymentMethod",
        "#paymentStatus": "paymentStatus",
        "#orderStatus": "orderStatus",
        "#zalopayAppTransId": "zalopayAppTransId",
        "#zalopayOrderUrl": "zalopayOrderUrl",
        "#zalopayPaymentExpiresAt": "zalopayPaymentExpiresAt",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":awaitingPayment": "AWAITING_PAYMENT",
        ":appTransId": input.appTransId,
        ":orderUrl": input.orderUrl,
        ":expiresAt": input.expiresAt,
        ":updatedAt": updatedAt,
        ":paymentMethod": "ZALOPAY",
        ":paymentStatus": "PENDING",
        ":processing": "PROCESSING",
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
        "SET #paymentStatus = :paid, #paymentTransactionId = :transactionId, #paidAt = :paidAt, #updatedAt = :updatedAt REMOVE #pendingPaymentStatus, #zalopayOrderUrl, #zalopayPaymentExpiresAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #paymentMethod = :paymentMethod AND #paymentStatus = :pending AND #orderStatus = :processing AND #zalopayAppTransId = :appTransId AND #total = :amount AND (attribute_not_exists(#pendingPaymentStatus) OR #pendingPaymentStatus = :awaitingPayment) AND (attribute_not_exists(#zalopayPaymentExpiresAt) OR #zalopayPaymentExpiresAt > :paidAt)",
      ExpressionAttributeNames: {
        "#paymentMethod": "paymentMethod",
        "#paymentStatus": "paymentStatus",
        "#orderStatus": "orderStatus",
        "#paymentTransactionId": "paymentTransactionId",
        "#paidAt": "paidAt",
        "#updatedAt": "updatedAt",
        "#pendingPaymentStatus": "pendingPaymentStatus",
        "#zalopayAppTransId": "zalopayAppTransId",
        "#zalopayOrderUrl": "zalopayOrderUrl",
        "#zalopayPaymentExpiresAt": "zalopayPaymentExpiresAt",
        "#total": "total",
      },
      ExpressionAttributeValues: {
        ":paymentMethod": "ZALOPAY",
        ":pending": "PENDING",
        ":paid": "PAID",
        ":processing": "PROCESSING",
        ":awaitingPayment": "AWAITING_PAYMENT",
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

  if (
    existingOrder.orderStatus !== "PROCESSING" &&
    existingOrder.orderStatus !== "SHIPPING"
  ) {
    throw new Error(
      "Chỉ có thể cập nhật vận chuyển cho đơn đang xử lý hoặc đang giao."
    );
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
    "#paymentMethod": "paymentMethod",
    "#paymentStatus": "paymentStatus",
  };

  const expressionAttributeValues: Record<string, unknown> = {
    ":shippingCarrier": input.shippingCarrier,
    ":shippingCarrierName":
      input.shippingCarrier === "OTHER"
        ? input.shippingCarrierName?.trim() || ""
        : "",
    ":shippingTrackingCode": input.shippingTrackingCode.trim(),
    ":shippingStatus": "SHIPPING",
    ":expectedOrderStatus": existingOrder.orderStatus,
    ":zalopay": "ZALOPAY",
    ":paid": "PAID",
    ":updatedAt": now,
  };

  if (existingOrder.orderStatus === "PROCESSING") {
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
      ConditionExpression:
        "attribute_exists(orderId) AND #orderStatus = :expectedOrderStatus AND (#paymentMethod <> :zalopay OR #paymentStatus = :paid)",
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

/**
 * Records a reconciliation attempt without changing the provider refund state.
 * Used when ZaloPay returns an unknown state or the provider cannot be reached.
 */
export async function recordZaloPayRefundCheck(
  input: RecordZaloPayRefundCheckInput
): Promise<Order | null> {
  const now = new Date().toISOString();

  const result = await docClient.send(
    new UpdateCommand({
      TableName: getOrdersTableName(),
      Key: {
        orderId: input.orderId,
      },
      UpdateExpression:
        "SET #refundLastCheckedAt = :checkedAt, #refundLastMessage = :message, #updatedAt = :updatedAt",
      ConditionExpression:
        "attribute_exists(orderId) AND #refundMerchantId = :merchantRefundId AND #refundStatus IN (:requesting, :pending)",
      ExpressionAttributeNames: {
        "#refundStatus": "refundStatus",
        "#refundMerchantId": "refundMerchantId",
        "#refundLastCheckedAt": "refundLastCheckedAt",
        "#refundLastMessage": "refundLastMessage",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":merchantRefundId": input.merchantRefundId,
        ":requesting": "REQUESTING",
        ":pending": "PENDING",
        ":checkedAt": now,
        ":message": input.message,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order | undefined) ?? null;
}

