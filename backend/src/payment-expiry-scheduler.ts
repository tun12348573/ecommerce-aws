import {
  reconcileExpiredZaloPayPayments,
} from "./jobs/payment-expiry-reconciliation.job";

export const handler = async () => {
  const startedAt = new Date().toISOString();

  console.info("Bắt đầu xử lý đơn ZaloPay hết hạn.", {
    startedAt,
  });

  const summary = await reconcileExpiredZaloPayPayments();

  console.info("Hoàn tất xử lý đơn ZaloPay hết hạn.", {
    startedAt,
    finishedAt: new Date().toISOString(),
    ...summary,
  });

  return summary;
};