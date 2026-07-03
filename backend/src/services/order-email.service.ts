import {
  SendEmailCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";

import type { Order, ShippingCarrier } from "../types/order";

const sesClient = new SESv2Client({
  region: process.env.AWS_REGION || "ap-southeast-1",
});

type EmailEventType =
  | "order_created"
  | "payment_confirmed"
  | "shipping_updated"
  | "order_cancelled";

type SendOrderEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  eventType: EmailEventType;
  orderId: string;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string): string {
  if (!value) {
    return "Chưa có";
  }

  return new Date(value).toLocaleString("vi-VN");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPaymentMethodLabel(order: Order): string {
  if (order.paymentMethod === "COD") {
    return "Thanh toán khi nhận hàng";
  }

  if (order.paymentMethod === "ZALOPAY") {
    return "ZaloPay";
  }

  return "Chuyển khoản ngân hàng";
}

function getShippingCarrierLabel(
  carrier?: ShippingCarrier,
  customCarrierName?: string
): string {
  if (!carrier) {
    return "Chưa cập nhật";
  }

  if (carrier === "OTHER" && customCarrierName?.trim()) {
    return customCarrierName.trim();
  }

  const labels: Record<ShippingCarrier, string> = {
    GHN: "Giao Hàng Nhanh",
    GHTK: "Giao Hàng Tiết Kiệm",
    JNT: "J&T Express",
    VIETTEL_POST: "Viettel Post",
    OTHER: "Đơn vị giao hàng khác",
  };

  return labels[carrier];
}

function buildItemsText(order: Order): string {
  return order.items
    .map(
      (item) =>
        `- ${item.name}: ${item.quantity} × ${formatMoney(
          item.salePrice
        )} = ${formatMoney(item.salePrice * item.quantity)}`
    )
    .join("\n");
}

function buildItemsHtml(order: Order): string {
  return order.items
    .map(
      (item) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0;">
            ${escapeHtml(item.name)}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: center;">
            ${item.quantity}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
            ${escapeHtml(formatMoney(item.salePrice * item.quantity))}
          </td>
        </tr>
      `
    )
    .join("");
}

function createEmailHtml(input: {
  title: string;
  greeting: string;
  description: string;
  details: Array<{
    label: string;
    value: string;
  }>;
  order?: Order;
}): string {
  const detailRows = input.details
    .map(
      (detail) => `
        <tr>
          <td style="padding: 8px 0; color: #64748b;">
            ${escapeHtml(detail.label)}
          </td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; color: #0f172a;">
            ${escapeHtml(detail.value)}
          </td>
        </tr>
      `
    )
    .join("");

  const productsSection = input.order
    ? `
      <h3 style="margin: 28px 0 12px; color: #0f172a;">
        Sản phẩm đã đặt
      </h3>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="color: #64748b;">
            <th style="padding-bottom: 10px; text-align: left;">Sản phẩm</th>
            <th style="padding-bottom: 10px; text-align: center;">SL</th>
            <th style="padding-bottom: 10px; text-align: right;">Thành tiền</th>
          </tr>
        </thead>

        <tbody>
          ${buildItemsHtml(input.order)}
        </tbody>
      </table>
    `
    : "";

  return `
    <!doctype html>
    <html lang="vi">
      <body style="margin: 0; padding: 24px; background: #f8fafc; font-family: Arial, sans-serif; color: #0f172a;">
        <main style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #64748b; font-size: 13px; font-weight: 700;">
            AWS SHOP
          </p>

          <h1 style="margin: 10px 0 16px; font-size: 26px;">
            ${escapeHtml(input.title)}
          </h1>

          <p style="margin: 0 0 12px; line-height: 1.6;">
            ${escapeHtml(input.greeting)}
          </p>

          <p style="margin: 0; line-height: 1.6; color: #475569;">
            ${escapeHtml(input.description)}
          </p>

          <table style="width: 100%; margin-top: 24px; border-collapse: collapse; font-size: 14px;">
            <tbody>
              ${detailRows}
            </tbody>
          </table>

          ${productsSection}

          <p style="margin: 30px 0 0; color: #64748b; font-size: 13px; line-height: 1.6;">
            Cảm ơn bạn đã mua sắm tại AWS Shop.
          </p>
        </main>
      </body>
    </html>
  `;
}

async function sendOrderEmail(
  input: SendOrderEmailInput
): Promise<void> {
  const fromEmail = process.env.SES_FROM_EMAIL?.trim();

  if (!fromEmail) {
    console.warn(
      "SES_FROM_EMAIL chưa được cấu hình. Bỏ qua gửi email."
    );
    return;
  }

  const recipientEmail = input.to.trim();

  if (!recipientEmail) {
    console.warn(
      `Đơn ${input.orderId} không có email người nhận. Bỏ qua gửi email.`
    );
    return;
  }

  try {
    const result = await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: fromEmail,
        Destination: {
          ToAddresses: [recipientEmail],
        },
        Content: {
          Simple: {
            Subject: {
              Charset: "UTF-8",
              Data: input.subject,
            },
            Body: {
              Text: {
                Charset: "UTF-8",
                Data: input.text,
              },
              Html: {
                Charset: "UTF-8",
                Data: input.html,
              },
            },
          },
        },
        EmailTags: [
          {
            Name: "event",
            Value: input.eventType,
          },
          {
            Name: "orderId",
            Value: input.orderId,
          },
        ],
      })
    );

    console.info(
      `SES gửi email thành công: event=${input.eventType}, orderId=${input.orderId}, messageId=${result.MessageId ?? "unknown"}`
    );
  } catch (error) {
    console.error(
      `SES gửi email thất bại: event=${input.eventType}, orderId=${input.orderId}`,
      error
    );
  }
}

export async function sendOrderCreatedEmail(
  order: Order
): Promise<void> {
  const subject = `AWS Shop | Đã nhận đơn hàng ${order.orderId}`;

  const text = [
    `Xin chào ${order.customer.fullName},`,
    "",
    "AWS Shop đã nhận đơn hàng của bạn.",
    `Mã đơn hàng: ${order.orderId}`,
    `Tổng tiền: ${formatMoney(order.total)}`,
    `Phương thức thanh toán: ${getPaymentMethodLabel(order)}`,
    `Trạng thái thanh toán: ${
      order.paymentStatus === "PAID"
        ? "Đã thanh toán"
        : "Chờ thanh toán"
    }`,
    "",
    "Sản phẩm đã đặt:",
    buildItemsText(order),
  ].join("\n");

  const html = createEmailHtml({
    title: "Đã nhận đơn hàng",
    greeting: `Xin chào ${order.customer.fullName},`,
    description:
      "Đơn hàng của bạn đã được ghi nhận. Shop sẽ chuẩn bị và cập nhật trạng thái sớm nhất.",
    details: [
      {
        label: "Mã đơn hàng",
        value: order.orderId,
      },
      {
        label: "Tổng tiền",
        value: formatMoney(order.total),
      },
      {
        label: "Phương thức thanh toán",
        value: getPaymentMethodLabel(order),
      },
      {
        label: "Ngày tạo",
        value: formatDate(order.createdAt),
      },
    ],
    order,
  });

  await sendOrderEmail({
    to: order.customer.email,
    subject,
    text,
    html,
    eventType: "order_created",
    orderId: order.orderId,
  });
}

export async function sendPaymentConfirmedEmail(
  order: Order
): Promise<void> {
  const subject = `AWS Shop | Thanh toán thành công ${order.orderId}`;

  const text = [
    `Xin chào ${order.customer.fullName},`,
    "",
    "Thanh toán đơn hàng của bạn đã được xác nhận.",
    `Mã đơn hàng: ${order.orderId}`,
    `Tổng tiền: ${formatMoney(order.total)}`,
    `Phương thức thanh toán: ${getPaymentMethodLabel(order)}`,
    `Thời gian thanh toán: ${formatDate(order.paidAt)}`,
    `Mã giao dịch: ${order.paymentTransactionId ?? "Chưa có"}`,
  ].join("\n");

  const html = createEmailHtml({
    title: "Thanh toán thành công",
    greeting: `Xin chào ${order.customer.fullName},`,
    description:
      "AWS Shop đã xác nhận thanh toán cho đơn hàng của bạn.",
    details: [
      {
        label: "Mã đơn hàng",
        value: order.orderId,
      },
      {
        label: "Tổng tiền",
        value: formatMoney(order.total),
      },
      {
        label: "Phương thức",
        value: getPaymentMethodLabel(order),
      },
      {
        label: "Thời gian thanh toán",
        value: formatDate(order.paidAt),
      },
      {
        label: "Mã giao dịch",
        value: order.paymentTransactionId ?? "Chưa có",
      },
    ],
  });

  await sendOrderEmail({
    to: order.customer.email,
    subject,
    text,
    html,
    eventType: "payment_confirmed",
    orderId: order.orderId,
  });
}

export async function sendShippingUpdatedEmail(
  order: Order
): Promise<void> {
  const carrier = getShippingCarrierLabel(
    order.shippingCarrier,
    order.shippingCarrierName
  );

  const trackingCode = order.shippingTrackingCode ?? "Chưa có";

  const subject = `AWS Shop | Đơn hàng đang được giao ${order.orderId}`;

  const text = [
    `Xin chào ${order.customer.fullName},`,
    "",
    "Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển.",
    `Mã đơn hàng: ${order.orderId}`,
    `Đơn vị giao hàng: ${carrier}`,
    `Mã vận đơn: ${trackingCode}`,
    `Thời gian bàn giao: ${formatDate(order.shippedAt)}`,
  ].join("\n");

  const html = createEmailHtml({
    title: "Đơn hàng đang được giao",
    greeting: `Xin chào ${order.customer.fullName},`,
    description:
      "Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển.",
    details: [
      {
        label: "Mã đơn hàng",
        value: order.orderId,
      },
      {
        label: "Đơn vị giao hàng",
        value: carrier,
      },
      {
        label: "Mã vận đơn",
        value: trackingCode,
      },
      {
        label: "Thời gian bàn giao",
        value: formatDate(order.shippedAt),
      },
    ],
  });

  await sendOrderEmail({
    to: order.customer.email,
    subject,
    text,
    html,
    eventType: "shipping_updated",
    orderId: order.orderId,
  });
}

export async function sendOrderCancelledEmail(
  order: Order
): Promise<void> {
  const paymentNotice =
    order.paymentStatus === "PAID"
      ? "Khoản thanh toán đã được ghi nhận. Shop sẽ kiểm tra và xử lý hoàn tiền theo chính sách hiện hành."
      : "Đơn hàng chưa thanh toán nên không có khoản tiền cần hoàn lại.";

  const subject = `AWS Shop | Đơn hàng đã hủy ${order.orderId}`;

  const text = [
    `Xin chào ${order.customer.fullName},`,
    "",
    "Đơn hàng của bạn đã được hủy theo yêu cầu.",
    `Mã đơn hàng: ${order.orderId}`,
    `Tổng tiền: ${formatMoney(order.total)}`,
    `Phương thức thanh toán: ${getPaymentMethodLabel(order)}`,
    `Trạng thái thanh toán: ${
      order.paymentStatus === "PAID"
        ? "Đã thanh toán"
        : "Chưa thanh toán"
    }`,
    "",
    paymentNotice,
  ].join("\n");

  const html = createEmailHtml({
    title: "Đơn hàng đã hủy",
    greeting: `Xin chào ${order.customer.fullName},`,
    description: `Đơn hàng của bạn đã được hủy theo yêu cầu. ${paymentNotice}`,
    details: [
      {
        label: "Mã đơn hàng",
        value: order.orderId,
      },
      {
        label: "Tổng tiền",
        value: formatMoney(order.total),
      },
      {
        label: "Phương thức thanh toán",
        value: getPaymentMethodLabel(order),
      },
      {
        label: "Trạng thái thanh toán",
        value:
          order.paymentStatus === "PAID"
            ? "Đã thanh toán"
            : "Chưa thanh toán",
      },
      {
        label: "Thời gian hủy",
        value: formatDate(order.updatedAt),
      },
    ],
  });

  await sendOrderEmail({
    to: order.customer.email,
    subject,
    text,
    html,
    eventType: "order_cancelled",
    orderId: order.orderId,
  });
}

