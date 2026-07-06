import {
  getOrderById,
  listExpiredZaloPayPaymentOrders,
  markZaloPayOrderPaid,
} from "../repositories/order.repository";

import {
  expireZaloPayOrderAndRestock,
} from "../services/order-cancellation.service";

import {
  sendPaymentConfirmedEmail,
  sendZaloPayPaymentExpiredEmail,
} from "../services/order-email.service";

import { queryZaloPayOrder } from "../services/zalopay-payment.service";

import type { Order } from "../types/order";

export type PaymentExpiryReconciliationSummary = {
  inspected: number;
  confirmedPaid: number;
  expired: number;
  skipped: number;
  providerUnavailable: number;
  errors: number;
};

function getBatchSize(): number {
  const parsed = Number(
    process.env.PAYMENT_EXPIRY_RECONCILIATION_BATCH_SIZE ?? "20"
  );

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 20;
  }

  return Math.min(parsed, 50);
}

function hasErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === name
  );
}

async function reconcilePaymentWithZaloPay(
  order: Order
): Promise<"PAID" | "UNPAID" | "SKIPPED" | "UNAVAILABLE"> {
  if (!order.zalopayAppTransId?.trim()) {
    return "UNPAID";
  }

  try {
    const providerResult = await queryZaloPayOrder(order.zalopayAppTransId);

    if (providerResult.returnCode !== 1) {
      return "UNPAID";
    }

    if (
      providerResult.amount !== order.total ||
      !providerResult.transactionId ||
      !providerResult.paidAt
    ) {
      console.error("ZaloPay trả dữ liệu thanh toán không hợp lệ.", {
        orderId: order.orderId,
      });

      return "UNAVAILABLE";
    }

    try {
      const paidOrder = await markZaloPayOrderPaid({
        orderId: order.orderId,
        appTransId: order.zalopayAppTransId,
        amount: providerResult.amount,
        transactionId: providerResult.transactionId,
        paidAt: providerResult.paidAt,
      });

      if (!paidOrder) {
        return "SKIPPED";
      }

      await sendPaymentConfirmedEmail(paidOrder);

      return "PAID";
    } catch (error) {
      if (!hasErrorName(error, "ConditionalCheckFailedException")) {
        throw error;
      }

      const latestOrder = await getOrderById(order.orderId);

      if (latestOrder?.paymentStatus === "PAID") {
        return "PAID";
      }

      return "SKIPPED";
    }
  } catch (error) {
    console.error("Không thể đối soát thanh toán ZaloPay trước khi hủy.", {
      orderId: order.orderId,
      error,
    });

    return "UNAVAILABLE";
  }
}

export async function reconcileExpiredZaloPayPayments(): Promise<PaymentExpiryReconciliationSummary> {
  const expiredOrders = await listExpiredZaloPayPaymentOrders({
    expiresBefore: new Date().toISOString(),
    limit: getBatchSize(),
  });

  const summary: PaymentExpiryReconciliationSummary = {
    inspected: expiredOrders.length,
    confirmedPaid: 0,
    expired: 0,
    skipped: 0,
    providerUnavailable: 0,
    errors: 0,
  };

  for (const order of expiredOrders) {
    const paymentResult = await reconcilePaymentWithZaloPay(order);

    if (paymentResult === "PAID") {
      summary.confirmedPaid += 1;
      continue;
    }

    if (paymentResult === "SKIPPED") {
      summary.skipped += 1;
      continue;
    }

    if (paymentResult === "UNAVAILABLE") {
      summary.providerUnavailable += 1;
      continue;
    }

    try {
      const expiredOrder = await expireZaloPayOrderAndRestock(order);

      summary.expired += 1;

      await sendZaloPayPaymentExpiredEmail(expiredOrder);
    } catch (error) {
      if (hasErrorName(error, "TransactionCanceledException")) {
        summary.skipped += 1;
        continue;
      }

      summary.errors += 1;

      console.error("Không thể hủy đơn ZaloPay hết hạn.", {
        orderId: order.orderId,
        error,
      });
    }
  }

  return summary;
}