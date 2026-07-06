import {
  listActiveZaloPayRefundOrders,
  recordZaloPayRefundCheck,
  syncZaloPayRefundStatus,
} from "../repositories/order.repository";
import { sendRefundCompletedEmail } from "../services/order-email.service";
import { queryZaloPayRefund } from "../services/zalopay-refund.service";
import type { Order } from "../types/order";

export type RefundReconciliationSummary = {
  inspected: number;
  pending: number;
  refunded: number;
  failed: number;
  unknown: number;
  skipped: number;
  errors: number;
};

function getBatchSize(): number {
  const parsed = Number(process.env.REFUND_RECONCILIATION_BATCH_SIZE ?? "20");

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 20;
  }

  return Math.min(parsed, 50);
}

function getLastReconciliationTime(order: Order): number {
  const value =
    order.refundLastCheckedAt ??
    order.refundRequestedAt ??
    order.createdAt;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? 0 : time;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Không thể kết nối hoặc truy vấn trạng thái hoàn tiền ZaloPay.";
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name ===
      "ConditionalCheckFailedException"
  );
}

function truncateMessage(message: string): string {
  return message.trim().slice(0, 500);
}

async function recordNonFinalCheck(input: {
  order: Order;
  message: string;
}): Promise<void> {
  const merchantRefundId = input.order.refundMerchantId?.trim();

  if (!merchantRefundId) {
    return;
  }

  try {
    await recordZaloPayRefundCheck({
      orderId: input.order.orderId,
      merchantRefundId,
      message: truncateMessage(input.message),
    });
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return;
    }

    console.error(
      "Không thể lưu lần kiểm tra refund vào DynamoDB.",
      {
        orderId: input.order.orderId,
        error: getErrorMessage(error),
      }
    );
  }
}

/**
 * Reconciles active ZaloPay refunds. The job is intentionally idempotent:
 * DynamoDB conditions prevent concurrent executions from sending a duplicate
 * refund-completed email or overwriting a final status.
 */
export async function reconcileZaloPayRefunds(): Promise<RefundReconciliationSummary> {
  const batchSize = getBatchSize();

  const activeRefunds = (await listActiveZaloPayRefundOrders())
    .sort(
      (first, second) =>
        getLastReconciliationTime(first) -
        getLastReconciliationTime(second)
    )
    .slice(0, batchSize);

  const summary: RefundReconciliationSummary = {
    inspected: activeRefunds.length,
    pending: 0,
    refunded: 0,
    failed: 0,
    unknown: 0,
    skipped: 0,
    errors: 0,
  };

  for (const order of activeRefunds) {
    const merchantRefundId = order.refundMerchantId?.trim();

    if (!merchantRefundId) {
      summary.skipped += 1;

      console.warn("Bỏ qua refund không có refundMerchantId.", {
        orderId: order.orderId,
        refundStatus: order.refundStatus,
      });

      continue;
    }

    try {
      const providerResult = await queryZaloPayRefund(merchantRefundId);

      if (providerResult.providerState === "UNKNOWN") {
        summary.unknown += 1;

        await recordNonFinalCheck({
          order,
          message: providerResult.returnMessage,
        });

        console.warn("ZaloPay trả về trạng thái refund chưa xác định.", {
          orderId: order.orderId,
          merchantRefundId,
          returnCode: providerResult.returnCode,
          returnMessage: providerResult.returnMessage,
        });

        continue;
      }

      const updatedOrder = await syncZaloPayRefundStatus({
        orderId: order.orderId,
        merchantRefundId,
        status: providerResult.providerState,
        providerRefundId: providerResult.providerRefundId,
        providerMessage: truncateMessage(providerResult.returnMessage),
      });

      if (!updatedOrder) {
        summary.skipped += 1;
        continue;
      }

      if (providerResult.providerState === "REFUNDED") {
        summary.refunded += 1;
        await sendRefundCompletedEmail(updatedOrder);
        continue;
      }

      if (providerResult.providerState === "FAILED") {
        summary.failed += 1;
        continue;
      }

      summary.pending += 1;
    } catch (error) {
      summary.errors += 1;

      const message = getErrorMessage(error);

      console.error("Không thể đồng bộ trạng thái hoàn tiền ZaloPay.", {
        orderId: order.orderId,
        merchantRefundId,
        error: message,
      });

      await recordNonFinalCheck({
        order,
        message: `Lỗi khi tự động kiểm tra ZaloPay: ${message}`,
      });
    }
  }

  return summary;
}
