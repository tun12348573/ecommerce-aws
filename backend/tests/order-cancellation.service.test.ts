import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../src/types/order";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class DynamoDBClient {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class TransactWriteCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return {
    DynamoDBDocumentClient: {
      from: () => ({
        send: sendMock,
      }),
    },
    TransactWriteCommand,
  };
});

import {
  cancelOrderAndRestock,
  expireZaloPayOrderAndRestock,
  OrderCancellationError,
} from "../src/services/order-cancellation.service";

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "order-001",
    customer: {
      fullName: "Ngoc Thinh",
      phone: "0900000000",
      email: "verified@example.com",
      address: "Ho Chi Minh City",
    },
    items: [
      {
        productId: "product-001",
        name: "Ao thun",
        slug: "ao-thun",
        price: 100_000,
        salePrice: 90_000,
        quantity: 2,
      },
    ],
    subtotal: 180_000,
    shippingFee: 30_000,
    discount: 0,
    total: 210_000,
    paymentMethod: "COD",
    paymentStatus: "PENDING",
    orderStatus: "PROCESSING",
    createdAt: "2026-07-06T09:00:00.000Z",
    updatedAt: "2026-07-06T09:00:00.000Z",
    ...overrides,
  };
}

describe("order-cancellation.service", () => {
  beforeEach(() => {
    process.env.ORDERS_TABLE = "EcommerceOrders";
    process.env.PRODUCTS_TABLE = "EcommerceProducts";
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T10:00:00.000Z"));
  });

  it("cancels an order and restores combined quantities in one DynamoDB transaction", async () => {
    const order = createOrder({
      items: [
        {
          productId: "product-001",
          name: "Ao thun",
          slug: "ao-thun",
          price: 100_000,
          salePrice: 90_000,
          quantity: 2,
        },
        {
          productId: "product-001",
          name: "Ao thun",
          slug: "ao-thun",
          price: 100_000,
          salePrice: 90_000,
          quantity: 3,
        },
        {
          productId: "product-002",
          name: "Quan jean",
          slug: "quan-jean",
          price: 300_000,
          salePrice: 280_000,
          quantity: 1,
        },
      ],
    });

    await cancelOrderAndRestock(order);

    expect(sendMock).toHaveBeenCalledTimes(1);

    const command = sendMock.mock.calls[0][0] as {
      input: {
        TransactItems: Array<{
          Update: {
            TableName: string;
            Key: Record<string, unknown>;
            UpdateExpression: string;
            ConditionExpression?: string;
            ExpressionAttributeValues?: Record<string, unknown>;
          };
        }>;
      };
    };

    const transactionItems = command.input.TransactItems;

    expect(transactionItems).toHaveLength(3);
    expect(transactionItems[0].Update.TableName).toBe("EcommerceOrders");
    expect(transactionItems[0].Update.ConditionExpression).toContain(
      "#orderStatus IN (:allowedStatus0, :allowedStatus1)"
    );
    expect(transactionItems[0].Update.UpdateExpression).toContain(
      "REMOVE #pendingPaymentStatus, #zalopayOrderUrl, #zalopayPaymentExpiresAt"
    );

    expect(transactionItems[1].Update).toMatchObject({
      TableName: "EcommerceProducts",
      Key: { productId: "product-001" },
      ExpressionAttributeValues: {
        ":quantity": 5,
      },
    });

    expect(transactionItems[2].Update).toMatchObject({
      TableName: "EcommerceProducts",
      Key: { productId: "product-002" },
      ExpressionAttributeValues: {
        ":quantity": 1,
      },
    });
  });

  it("rejects cancellation when order items are invalid before DynamoDB is called", async () => {
    const order = createOrder({
      items: [],
    });

    await expect(cancelOrderAndRestock(order)).rejects.toBeInstanceOf(
      OrderCancellationError
    );
    await expect(cancelOrderAndRestock(order)).rejects.toThrow(
      "Đơn hàng không có sản phẩm để hoàn tồn kho."
    );

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("expires only an awaiting ZaloPay order and removes payment-session fields from the returned order", async () => {
    const order = createOrder({
      paymentMethod: "ZALOPAY",
      paymentStatus: "PENDING",
      orderStatus: "PROCESSING",
      statusHistory: [
        {
          status: "PROCESSING",
          changedAt: "2026-07-06T09:00:00.000Z",
        },
      ],
      ...({
        pendingPaymentStatus: "AWAITING_PAYMENT",
        zalopayAppTransId: "260706_order-001",
        zalopayOrderUrl: "https://sandbox.zalopay.vn/pay/order-001",
        zalopayPaymentExpiresAt: "2026-07-06T09:15:00.000Z",
      } as Partial<Order>),
    });

    const expiredOrder = await expireZaloPayOrderAndRestock(order);

    const command = sendMock.mock.calls[0][0] as {
      input: {
        TransactItems: Array<{
          Update: {
            ConditionExpression?: string;
            UpdateExpression: string;
          };
        }>;
      };
    };

    expect(command.input.TransactItems[0].Update.ConditionExpression).toContain(
      "#pendingPaymentStatus = :awaitingPayment"
    );
    expect(command.input.TransactItems[0].Update.ConditionExpression).toContain(
      "#zalopayPaymentExpiresAt <= :updatedAt"
    );

    expect(expiredOrder.orderStatus).toBe("CANCELLED");
    expect(expiredOrder.updatedAt).toBe("2026-07-06T10:00:00.000Z");
    expect(expiredOrder.statusHistory).toHaveLength(2);
    expect(expiredOrder).not.toHaveProperty("pendingPaymentStatus");
    expect(expiredOrder).not.toHaveProperty("zalopayOrderUrl");
    expect(expiredOrder).not.toHaveProperty("zalopayPaymentExpiresAt");
  });
});
