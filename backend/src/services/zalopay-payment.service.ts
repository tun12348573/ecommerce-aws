import { createHmac, timingSafeEqual } from "node:crypto";

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import type { Order } from "../types/order";

const secretsManagerClient = new SecretsManagerClient({
  region: process.env.AWS_REGION,
});

const ZALOPAY_SANDBOX_CREATE_URL =
  "https://sb-openapi.zalopay.vn/v2/create";

const ZALOPAY_SANDBOX_QUERY_URL =
  "https://sb-openapi.zalopay.vn/v2/query";

const DEFAULT_PAYMENT_EXPIRE_SECONDS = 15 * 60;

function getPaymentExpireSeconds(): number {
  const minutes = Number(
    process.env.ZALOPAY_PAYMENT_RESERVATION_MINUTES ?? "15"
  );

  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) {
    return DEFAULT_PAYMENT_EXPIRE_SECONDS;
  }

  return minutes * 60;
}

type ZaloPayCredentials = {
  appId: number;
  key1: string;
  key2: string;
};

type ZaloPayCreateResponse = {
  return_code: number;
  return_message: string;
  sub_return_code?: number;
  sub_return_message?: string;
  order_url?: string;
};

type ZaloPayQueryResponse = {
  return_code: number;
  return_message: string;
  amount?: number;
  zp_trans_id?: number | string;
  server_time?: number;
};

type ZaloPayCallbackData = {
  app_id: number;
  app_trans_id: string;
  amount: number;
  zp_trans_id: number | string;
  server_time: number;
};

type CreateZaloPayOrderResult = {
  appTransId: string;
  orderUrl: string;
  expiresAt: string;
};

type ZaloPayQueryResult = {
  returnCode: number;
  returnMessage: string;
  amount?: number;
  transactionId?: string;
  paidAt?: string;
};

let cachedCredentials: ZaloPayCredentials | null = null;

export class ZaloPayPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZaloPayPaymentError";
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new ZaloPayPaymentError(`${name} is missing.`);
  }

  return value;
}

function createHmacSha256(value: string, key: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function isSafeMacEqual(expected: string, received: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(received)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function getZaloPayCredentials(): Promise<ZaloPayCredentials> {
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
    throw new ZaloPayPaymentError(
      "ZaloPay secret không có SecretString."
    );
  }

  let parsedSecret: Record<string, unknown>;

  try {
    parsedSecret = JSON.parse(result.SecretString) as Record<string, unknown>;
  } catch {
    throw new ZaloPayPaymentError("ZaloPay secret không phải JSON hợp lệ.");
  }

  const appId = Number(parsedSecret.ZALOPAY_APP_ID);
  const key1 = String(parsedSecret.ZALOPAY_KEY1 ?? "").trim();
  const key2 = String(parsedSecret.ZALOPAY_KEY2 ?? "").trim();

  if (!Number.isInteger(appId) || appId <= 0 || !key1 || !key2) {
    throw new ZaloPayPaymentError(
      "ZaloPay secret thiếu ZALOPAY_APP_ID, ZALOPAY_KEY1 hoặc ZALOPAY_KEY2."
    );
  }

  cachedCredentials = {
    appId,
    key1,
    key2,
  };

  return cachedCredentials;
}

function getVietnamDatePrefix(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new ZaloPayPaymentError("Không thể tạo ngày giao dịch ZaloPay.");
  }

  return `${year}${month}${day}`;
}

export function createZaloPayAppTransId(orderId: string): string {
  const compactUuid = orderId
    .replace(/^ord_/, "")
    .replace(/-/g, "")
    .toLowerCase();

  if (!/^[a-f0-9]{32}$/.test(compactUuid)) {
    throw new ZaloPayPaymentError("Mã đơn hàng không hợp lệ.");
  }

  return `${getVietnamDatePrefix()}_${compactUuid}`;
}

export function getOrderIdFromZaloPayAppTransId(
  appTransId: string
): string | null {
  const match = appTransId.match(/^\d{6}_([a-f0-9]{32})$/i);

  if (!match) {
    return null;
  }

  const value = match[1];

  return `ord_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(
    12,
    16
  )}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function createZaloPayOrder(
  order: Order
): Promise<CreateZaloPayOrderResult> {
  const credentials = await getZaloPayCredentials();

  const appTransId = createZaloPayAppTransId(order.orderId);
  const appTime = Date.now();
  const paymentExpireSeconds = getPaymentExpireSeconds();

  const redirectUrl = new URL(getRequiredEnv("ZALOPAY_REDIRECT_URL"));

  redirectUrl.searchParams.set("orderId", order.orderId);
  redirectUrl.searchParams.set("paymentMethod", "ZALOPAY");

  const embedData = JSON.stringify({
    redirecturl: redirectUrl.toString(),
  });

  const item = JSON.stringify(
    order.items.map((product) => ({
      itemid: product.productId,
      itemname: product.name,
      itemprice: product.salePrice,
      itemquantity: product.quantity,
    }))
  );

  const macData = [
    credentials.appId,
    appTransId,
    order.orderId,
    order.total,
    appTime,
    embedData,
    item,
  ].join("|");

  const mac = createHmacSha256(macData, credentials.key1);

  const response = await fetch(ZALOPAY_SANDBOX_CREATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      app_id: credentials.appId,
      app_user: order.orderId,
      app_trans_id: appTransId,
      app_time: appTime,
      expire_duration_seconds: paymentExpireSeconds,
      amount: order.total,
      description: `Thanh toan don ${order.orderId}`,
      callback_url: getRequiredEnv("ZALOPAY_CALLBACK_URL"),
      item,
      embed_data: embedData,
      bank_code: "",
      mac,
    }),
  });

  const payload = (await response.json()) as ZaloPayCreateResponse;

  if (
    !response.ok ||
    payload.return_code !== 1 ||
    typeof payload.order_url !== "string" ||
    !payload.order_url
  ) {
    throw new ZaloPayPaymentError(
      payload.return_message || "ZaloPay không thể tạo giao dịch."
    );
  }

  return {
    appTransId,
    orderUrl: payload.order_url,
    expiresAt: new Date(
      appTime + paymentExpireSeconds * 1000
    ).toISOString(),
  };
}

export async function verifyZaloPayCallback(
  data: unknown,
  mac: unknown
): Promise<ZaloPayCallbackData> {
  if (typeof data !== "string" || typeof mac !== "string") {
    throw new ZaloPayPaymentError("Callback ZaloPay không hợp lệ.");
  }

  const credentials = await getZaloPayCredentials();

  const expectedMac = createHmacSha256(data, credentials.key2);

  if (!isSafeMacEqual(expectedMac, mac)) {
    throw new ZaloPayPaymentError("Chữ ký callback ZaloPay không hợp lệ.");
  }

  let payload: ZaloPayCallbackData;

  try {
    payload = JSON.parse(data) as ZaloPayCallbackData;
  } catch {
    throw new ZaloPayPaymentError("Dữ liệu callback ZaloPay không hợp lệ.");
  }

  if (
    payload.app_id !== credentials.appId ||
    typeof payload.app_trans_id !== "string" ||
    !Number.isFinite(payload.amount) ||
    !payload.zp_trans_id ||
    !Number.isFinite(payload.server_time)
  ) {
    throw new ZaloPayPaymentError("Callback ZaloPay thiếu dữ liệu bắt buộc.");
  }

  return payload;
}

export async function queryZaloPayOrder(
  appTransId: string
): Promise<ZaloPayQueryResult> {
  const credentials = await getZaloPayCredentials();

  const macData = `${credentials.appId}|${appTransId}|${credentials.key1}`;

  const mac = createHmacSha256(macData, credentials.key1);

  const response = await fetch(ZALOPAY_SANDBOX_QUERY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      app_id: credentials.appId,
      app_trans_id: appTransId,
      mac,
    }),
  });

  const payload = (await response.json()) as ZaloPayQueryResponse;

  if (!response.ok || !Number.isInteger(payload.return_code)) {
    throw new ZaloPayPaymentError(
      payload.return_message || "Không thể truy vấn giao dịch ZaloPay."
    );
  }

  return {
    returnCode: payload.return_code,
    returnMessage: payload.return_message,
    amount: payload.amount,
    transactionId:
      payload.zp_trans_id === undefined
        ? undefined
        : String(payload.zp_trans_id),
    paidAt:
      typeof payload.server_time === "number"
        ? new Date(payload.server_time).toISOString()
        : undefined,
  };
}

