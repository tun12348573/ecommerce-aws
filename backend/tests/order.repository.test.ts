import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../src/types/order";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("../src/shared/dynamodb", () => ({
  docClient: {
    send: sendMock,
  },
  getOrdersTableName: () => "EcommerceOrders",
  getProductsTableName: () => "EcommerceProducts",
}));

import {
  markZaloPayOrderPaid,
  updateOrderShipping,
  updateOrderStatus,
} from "../src/repositories/order.repository";

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
        quantity: 1,
      },
    ],
    subtotal: 90_000,
    shippingFee: 30_000,
    discount: 0,
    total: 120_000,
    paymentMethod: "ZALOPAY",
    paymentStatus: "PENDING",
    orderStatus: "PROCESSING",
    createdAt: "2026-07-06T09:00:00.000Z",
    updatedAt: "2026-07-06T09:00:00.000Z",
    ...overrides,
  };
}

describe("order.repository transition guards", () => {
  beforeEach(() => {
    sendMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T10:00:00.000Z"));
  });

  it("requires a paid ZaloPay order before it can move from PROCESSING to SHIPPING", async () => {
    const pendingZaloPayOrder = createOrder();

    sendMock
      .mockResolvedValueOnce({ Item: pendingZaloPayOrder })
      .mockResolvedValueOnce({
        Attributes: {
          ...pendingZaloPayOrder,
          orderStatus: "SHIPPING",
        },
      });

    await updateOrderStatus(pendingZaloPayOrder.orderId, "SHIPPING");

    const updateCommand = sendMock.mock.calls[1][0] as {
      input: {
        ConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };

    expect(updateCommand.input.ConditionExpression).toContain(
      "#orderStatus = :expectedOrderStatus"
    );
    expect(updateCommand.input.ConditionExpression).toContain(
      "#paymentMethod <> :zalopay OR #paymentStatus = :paid"
    );
    expect(updateCommand.input.ExpressionAttributeValues).toMatchObject({
      ":expectedOrderStatus": "PROCESSING",
      ":zalopay": "ZALOPAY",
      ":paid": "PAID",
    });
  });

  it("does not allow updateOrderStatus to skip the required workflow", async () => {
    const shippingOrder = createOrder({
      paymentMethod: "COD",
      orderStatus: "SHIPPING",
    });

    sendMock.mockResolvedValueOnce({ Item: shippingOrder });

    await expect(
      updateOrderStatus(shippingOrder.orderId, "CANCELLED")
    ).rejects.toThrow(
      "updateOrderStatus chỉ hỗ trợ luồng PROCESSING → SHIPPING → COMPLETED."
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("marks a ZaloPay order paid only while it is still PROCESSING and before expiry", async () => {
    sendMock.mockResolvedValueOnce({
      Attributes: createOrder({
        paymentStatus: "PAID",
        paymentTransactionId: "zp-trans-001",
      }),
    });

    await markZaloPayOrderPaid({
      orderId: "order-001",
      appTransId: "260706_order-001",
      amount: 120_000,
      transactionId: "zp-trans-001",
      paidAt: "2026-07-06T10:00:00.000Z",
    });

    const updateCommand = sendMock.mock.calls[0][0] as {
      input: {
        ConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };

    expect(updateCommand.input.ConditionExpression).toContain(
      "#orderStatus = :processing"
    );
    expect(updateCommand.input.ConditionExpression).toContain(
      "#zalopayPaymentExpiresAt > :paidAt"
    );
    expect(updateCommand.input.ExpressionAttributeValues).toMatchObject({
      ":processing": "PROCESSING",
      ":pending": "PENDING",
      ":paid": "PAID",
    });
  });

  it("requires payment before admin can attach shipping information to a ZaloPay order", async () => {
    const pendingZaloPayOrder = createOrder();

    sendMock
      .mockResolvedValueOnce({ Item: pendingZaloPayOrder })
      .mockResolvedValueOnce({
        Attributes: {
          ...pendingZaloPayOrder,
          orderStatus: "SHIPPING",
          shippingCarrier: "GHN",
          shippingTrackingCode: "GHN-001",
        },
      });

    await updateOrderShipping({
      orderId: pendingZaloPayOrder.orderId,
      shippingCarrier: "GHN",
      shippingTrackingCode: "GHN-001",
    });

    const updateCommand = sendMock.mock.calls[1][0] as {
      input: {
        ConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
    };

    expect(updateCommand.input.ConditionExpression).toContain(
      "#paymentMethod <> :zalopay OR #paymentStatus = :paid"
    );
    expect(updateCommand.input.ExpressionAttributeValues).toMatchObject({
      ":expectedOrderStatus": "PROCESSING",
      ":zalopay": "ZALOPAY",
      ":paid": "PAID",
    });
  });
});
