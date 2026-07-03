import { createHmac, randomUUID } from "node:crypto";

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const secretsManagerClient = new SecretsManagerClient({
  region: process.env.AWS_REGION,
});

const ZALOPAY_SANDBOX_REFUND_URL =
  "https://sb-openapi.zalopay.vn/v2/refund";

const ZALOPAY_SANDBOX_QUERY_REFUND_URL =
  "https://sb-openapi.zalopay.vn/v2/query_refund";

type ZaloPayRefundCredentials = {
  appId: number;
  key1: string;
};

type ZaloPayRefundResponse = {
  return_code?: number;
  return_message?: string;
  sub_return_code?: number;
  sub_return_message?: string;
  refund_id?: number | string;
};

type ZaloPayRefundQueryResponse = ZaloPayRefundResponse & {
  refund_status?: number;
};

export type ZaloPayRefundProviderState =
  | "REFUNDED"
  | "PENDING"
  | "FAILED"
  | "UNKNOWN";

export type CreateZaloPayRefundResult = {
  merchantRefundId: string;
  providerRefundId?: string;
  returnCode: number;
  returnMessage: string;
};

export type QueryZaloPayRefundResult = {
  providerState: ZaloPayRefundProviderState;
  providerRefundId?: string;
  returnCode: number;
  returnMessage: string;
};

let cachedCredentials: ZaloPayRefundCredentials | null = null;

export class ZaloPayRefundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZaloPayRefundError";
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new ZaloPayRefundError(`${name} is missing.`);
  }

  return value;
}

function createHmacSha256(value: string, key: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ZaloPayRefundError(
      "ZaloPay trả về dữ liệu không phải JSON hợp lệ."
    );
  }
}

async function getZaloPayRefundCredentials(): Promise<ZaloPayRefundCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const secretId = getRequiredEnv("ZALOPAY_SECRET_ID");

  const result = await secretsManagerClient.send(
    new GetSecretValueCommand({
      SecretId: secretId,
    })
  );

  if (!result.SecretString) {
    throw new ZaloPayRefundError(
      "ZaloPay secret không có SecretString."
    );
  }

  let parsedSecret: Record<string, unknown>;

  try {
    parsedSecret = JSON.parse(result.SecretString) as Record<string, unknown>;
  } catch {
    throw new ZaloPayRefundError("ZaloPay secret không phải JSON hợp lệ.");
  }

  const appId = Number(parsedSecret.ZALOPAY_APP_ID);
  const key1 = String(parsedSecret.ZALOPAY_KEY1 ?? "").trim();

  if (!Number.isInteger(appId) || appId <= 0 || !key1) {
    throw new ZaloPayRefundError(
      "ZaloPay secret thiếu ZALOPAY_APP_ID hoặc ZALOPAY_KEY1."
    );
  }

  cachedCredentials = {
    appId,
    key1,
  };

  return cachedCredentials;
}

function getVietnamDatePrefix(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new ZaloPayRefundError(
      "Không thể tạo ngày giao dịch hoàn tiền ZaloPay."
    );
  }

  return `${year}${month}${day}`;
}

function getProviderMessage(payload: ZaloPayRefundResponse): string {
  return (
    payload.sub_return_message?.trim() ||
    payload.return_message?.trim() ||
    "ZaloPay không thể xử lý yêu cầu hoàn tiền."
  );
}

/**
 * m_refund_id format: yymmdd_appid_refund-identifier.
 * Keeping the random suffix short makes the value safely fit within 45 chars.
 */
export async function createZaloPayMerchantRefundId(): Promise<string> {
  const credentials = await getZaloPayRefundCredentials();
  const suffix = randomUUID().replace(/-/g, "").slice(0, 20);

  return `${getVietnamDatePrefix()}_${credentials.appId}_${suffix}`;
}

export async function createZaloPayRefund(input: {
  merchantRefundId: string;
  zpTransactionId: string;
  amount: number;
  description: string;
}): Promise<CreateZaloPayRefundResult> {
  const credentials = await getZaloPayRefundCredentials();

  const merchantRefundId = input.merchantRefundId.trim();
  const zpTransactionId = input.zpTransactionId.trim();
  const description = input.description.trim();
  const amount = input.amount;
  const timestamp = Date.now();

  if (!merchantRefundId || merchantRefundId.length > 45) {
    throw new ZaloPayRefundError("Mã hoàn tiền merchant không hợp lệ.");
  }

  if (!zpTransactionId) {
    throw new ZaloPayRefundError(
      "Đơn hàng không có mã giao dịch ZaloPay để hoàn tiền."
    );
  }

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ZaloPayRefundError("Số tiền hoàn không hợp lệ.");
  }

  if (!description || description.length > 256) {
    throw new ZaloPayRefundError(
      "Lý do hoàn tiền phải có từ 1 đến 256 ký tự."
    );
  }

  const macData = [
    credentials.appId,
    zpTransactionId,
    amount,
    description,
    timestamp,
  ].join("|");

  const mac = createHmacSha256(macData, credentials.key1);

  const response = await fetch(ZALOPAY_SANDBOX_REFUND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      app_id: credentials.appId,
      m_refund_id: merchantRefundId,
      zp_trans_id: zpTransactionId,
      amount,
      timestamp,
      description,
      mac,
    }),
  });

  const payload = await parseJsonResponse<ZaloPayRefundResponse>(response);

  if (!response.ok || payload.return_code !== 1) {
    throw new ZaloPayRefundError(getProviderMessage(payload));
  }

  return {
    merchantRefundId,
    providerRefundId:
      payload.refund_id === undefined ? undefined : String(payload.refund_id),
    returnCode: payload.return_code,
    returnMessage:
      payload.return_message?.trim() || "Đã gửi yêu cầu hoàn tiền đến ZaloPay.",
  };
}

function getProviderState(
  payload: ZaloPayRefundQueryResponse
): ZaloPayRefundProviderState {
  if (payload.return_code !== 1) {
    return "UNKNOWN";
  }

  // ZaloPay documents refund_status as:
  // 1 = refunded, 2 = failed, 3 = refunding.
  if (payload.refund_status === 1) {
    return "REFUNDED";
  }

  if (payload.refund_status === 2) {
    return "FAILED";
  }

  if (payload.refund_status === 3) {
    return "PENDING";
  }

  // Never infer a completed refund when the provider does not explicitly say so.
  return "UNKNOWN";
}

export async function queryZaloPayRefund(
  merchantRefundId: string
): Promise<QueryZaloPayRefundResult> {
  const credentials = await getZaloPayRefundCredentials();

  const mRefundId = merchantRefundId.trim();
  const timestamp = Date.now();

  if (!mRefundId || mRefundId.length > 45) {
    throw new ZaloPayRefundError("Mã hoàn tiền merchant không hợp lệ.");
  }

  const macData = [credentials.appId, mRefundId, timestamp].join("|");

  const mac = createHmacSha256(macData, credentials.key1);

  const response = await fetch(ZALOPAY_SANDBOX_QUERY_REFUND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      app_id: credentials.appId,
      m_refund_id: mRefundId,
      timestamp,
      mac,
    }),
  });

  const payload = await parseJsonResponse<ZaloPayRefundQueryResponse>(response);
  const returnCode = payload.return_code;

  if (
    !response.ok ||
    typeof returnCode !== "number" ||
    !Number.isInteger(returnCode)
  ) {
    throw new ZaloPayRefundError(getProviderMessage(payload));
  }

  return {
    providerState: getProviderState(payload),
    providerRefundId:
      payload.refund_id === undefined ? undefined : String(payload.refund_id),
    returnCode,
    returnMessage:
      payload.sub_return_message?.trim() ||
      payload.return_message?.trim() ||
      "Đã truy vấn trạng thái hoàn tiền ZaloPay.",
  };
}
