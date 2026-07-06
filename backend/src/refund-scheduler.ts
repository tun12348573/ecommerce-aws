import { reconcileZaloPayRefunds } from "./jobs/refund-reconciliation.job";

/**
 * EventBridge Scheduler invokes this Lambda every five minutes.
 * Do not wrap this handler with serverless-http: it is not an API Gateway route.
 */
export const handler = async () => {
  const startedAt = new Date().toISOString();

  console.info("Bắt đầu đồng bộ hoàn tiền ZaloPay.", {
    startedAt,
  });

  const summary = await reconcileZaloPayRefunds();

  console.info("Hoàn tất đồng bộ hoàn tiền ZaloPay.", {
    startedAt,
    finishedAt: new Date().toISOString(),
    ...summary,
  });

  return summary;
};
