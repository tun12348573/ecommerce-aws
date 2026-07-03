"use client";

import { useState } from "react";

import { adminPatch } from "@/lib/admin-api";
import type { Order, RefundStatus } from "@/types/order";

type OrderResponse = {
  data: Order;
  message?: string;
};

type AdminZaloPayRefundPanelProps = {
  order: Order;
  onOrderUpdated: (order: Order) => void;
};

const refundStatusLabels: Record<RefundStatus, string> = {
  REQUESTING: "Đang khởi tạo",
  PENDING: "Đang chờ ZaloPay xử lý",
  REFUNDED: "Đã hoàn tiền",
  FAILED: "Hoàn tiền thất bại",
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

function getStatusClassName(status: RefundStatus): string {
  if (status === "REFUNDED") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "FAILED") {
    return "bg-red-50 text-red-700";
  }

  if (status === "PENDING") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-blue-50 text-blue-700";
}

export function AdminZaloPayRefundPanel({
  order,
  onOrderUpdated,
}: AdminZaloPayRefundPanelProps) {
  const [reason, setReason] = useState(order.refundReason ?? "");
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isZaloPayPaid =
    order.paymentMethod === "ZALOPAY" &&
    order.paymentStatus === "PAID";

  if (!isZaloPayPaid) {
    return null;
  }

  const canCreateRefund =
    order.orderStatus === "CANCELLED" &&
    order.refundStatus !== "REQUESTING" &&
    order.refundStatus !== "PENDING" &&
    order.refundStatus !== "REFUNDED";

  const canQueryRefund =
    order.orderStatus === "CANCELLED" &&
    Boolean(order.refundMerchantId) &&
    order.refundStatus !== "REFUNDED";

  async function handleCreateRefund() {
    const confirmed = window.confirm(
      `Gửi yêu cầu hoàn ${formatMoney(
        order.total
      )} cho đơn ${order.orderId} qua ZaloPay?`
    );

    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsWorking(true);

    try {
      const response = await adminPatch<OrderResponse, { reason?: string }>(
        `/admin/orders/${encodeURIComponent(order.orderId)}/refund`,
        {
          reason: reason.trim() || undefined,
        }
      );

      onOrderUpdated(response.data);
      setSuccessMessage(
        response.message ||
          "Đã gửi yêu cầu hoàn tiền đến ZaloPay. Hãy truy vấn lại để xác nhận."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể tạo yêu cầu hoàn tiền."
      );
    } finally {
      setIsWorking(false);
    }
  }

  async function handleQueryRefund() {
    setErrorMessage("");
    setSuccessMessage("");
    setIsWorking(true);

    try {
      const response = await adminPatch<OrderResponse, Record<string, never>>(
        `/admin/orders/${encodeURIComponent(order.orderId)}/refund/query`,
        {}
      );

      onOrderUpdated(response.data);
      setSuccessMessage(
        response.message || "Đã cập nhật trạng thái hoàn tiền."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể truy vấn trạng thái hoàn tiền."
      );
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">
        Hoàn tiền ZaloPay
      </h2>

      {order.orderStatus !== "CANCELLED" ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Chỉ có thể hoàn tiền sau khi đơn đã được hủy.
        </p>
      ) : null}

      {order.refundStatus ? (
        <div className="mt-4 space-y-3 text-sm">
          <div
            className={`w-fit rounded-lg px-3 py-2 font-semibold ${getStatusClassName(
              order.refundStatus
            )}`}
          >
            {refundStatusLabels[order.refundStatus]}
          </div>

          <div>
            <p className="text-slate-500">Số tiền hoàn</p>
            <p className="mt-1 font-semibold text-slate-900">
              {formatMoney(order.refundAmount ?? order.total)}
            </p>
          </div>

          <div>
            <p className="text-slate-500">Mã hoàn tiền merchant</p>
            <p className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
              {order.refundMerchantId ?? "Chưa có"}
            </p>
          </div>

          <div>
            <p className="text-slate-500">Mã hoàn tiền ZaloPay</p>
            <p className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
              {order.refundZaloPayId ?? "Chưa có"}
            </p>
          </div>

          <div>
            <p className="text-slate-500">Kiểm tra gần nhất</p>
            <p className="mt-1 font-semibold text-slate-900">
              {formatDate(order.refundLastCheckedAt)}
            </p>
          </div>

          {order.refundLastMessage ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-slate-700">
              {order.refundLastMessage}
            </p>
          ) : null}

          {order.refundCompletedAt ? (
            <p className="text-sm font-semibold text-emerald-700">
              Hoàn tất lúc: {formatDate(order.refundCompletedAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {canCreateRefund ? (
        <div className="mt-5">
          <label className="block text-sm font-semibold text-slate-700">
            Lý do hoàn tiền
          </label>

          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={256}
            className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
            placeholder="Ví dụ: Khách hủy đơn trước khi giao hàng"
          />

          <button
            type="button"
            onClick={() => void handleCreateRefund()}
            disabled={isWorking}
            className="mt-4 w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWorking
              ? "Đang gửi yêu cầu..."
              : `Hoàn ${formatMoney(order.total)} qua ZaloPay`}
          </button>
        </div>
      ) : null}

      {canQueryRefund ? (
        <button
          type="button"
          onClick={() => void handleQueryRefund()}
          disabled={isWorking}
          className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWorking ? "Đang kiểm tra..." : "Kiểm tra trạng thái hoàn tiền"}
        </button>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}
    </section>
  );
}
