"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminAuthError } from "@/lib/admin-auth";
import { adminGet, adminPatch } from "@/lib/admin-api";
import type { Order, RefundStatus } from "@/types/order";

type RefundFilter = "ALL" | RefundStatus;

type RefundsResponse = {
  data: Order[];
  meta?: {
    status: RefundFilter;
    total: number;
  };
};

type RefundQueryResponse = {
  data: Order;
  message?: string;
};

const refundFilters: Array<{
  value: RefundFilter;
  label: string;
}> = [
  { value: "ALL", label: "Tất cả" },
  { value: "REQUESTING", label: "Đang khởi tạo" },
  { value: "PENDING", label: "Chờ xác nhận" },
  { value: "REFUNDED", label: "Đã hoàn tiền" },
  { value: "FAILED", label: "Thất bại" },
];

const refundStatusLabels: Record<RefundStatus, string> = {
  REQUESTING: "Đang khởi tạo",
  PENDING: "Chờ ZaloPay xác nhận",
  REFUNDED: "Đã hoàn tiền",
  FAILED: "Thất bại",
};

function formatMoney(value?: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatDate(value?: string): string {
  if (!value) {
    return "Chưa có";
  }

  return new Date(value).toLocaleString("vi-VN");
}

function getRefundStatusClassName(status?: RefundStatus): string {
  if (status === "REFUNDED") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "FAILED") {
    return "bg-red-50 text-red-700";
  }

  if (status === "REQUESTING") {
    return "bg-slate-100 text-slate-700";
  }

  return "bg-amber-50 text-amber-700";
}

function AdminRefundsContent() {
  const router = useRouter();

  const [filter, setFilter] = useState<RefundFilter>("ALL");
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [checkingOrderId, setCheckingOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AdminAuthError) {
        router.replace("/admin/login/");
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể tải danh sách hoàn tiền."
      );
    },
    [router]
  );

  const fetchRefunds = useCallback(async (selectedFilter: RefundFilter) => {
    const query =
      selectedFilter === "ALL"
        ? ""
        : `?status=${encodeURIComponent(selectedFilter)}`;

    return adminGet<RefundsResponse>(`/admin/refunds${query}`);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadRefunds() {
      try {
        const response = await fetchRefunds(filter);

        if (!isMounted) {
          return;
        }

        setOrders(response.data);
        setErrorMessage("");
      } catch (error) {
        if (isMounted) {
          handleError(error);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRefunds();

    return () => {
      isMounted = false;
    };
  }, [fetchRefunds, filter, handleError]);

  async function handleRefresh() {
    setIsLoading(true);
    setErrorMessage("");
    setActionMessage("");

    try {
      const response = await fetchRefunds(filter);
      setOrders(response.data);
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleFilterChange(nextFilter: RefundFilter) {
    if (nextFilter === filter) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setActionMessage("");
    setFilter(nextFilter);
  }

  async function handleQueryRefund(order: Order) {
    if (
      order.refundStatus !== "REQUESTING" &&
      order.refundStatus !== "PENDING"
    ) {
      return;
    }

    setCheckingOrderId(order.orderId);
    setErrorMessage("");
    setActionMessage("");

    try {
      const response = await adminPatch<RefundQueryResponse, Record<string, never>>(
        `/admin/orders/${encodeURIComponent(order.orderId)}/refund/query`,
        {}
      );

      const updatedOrder = response.data;

      setOrders((currentOrders) => {
        if (
          filter !== "ALL" &&
          updatedOrder.refundStatus !== filter
        ) {
          return currentOrders.filter(
            (currentOrder) => currentOrder.orderId !== updatedOrder.orderId
          );
        }

        return currentOrders.map((currentOrder) =>
          currentOrder.orderId === updatedOrder.orderId
            ? updatedOrder
            : currentOrder
        );
      });

      setActionMessage(
        response.message || "Đã cập nhật trạng thái hoàn tiền."
      );
    } catch (error) {
      handleError(error);
    } finally {
      setCheckingOrderId(null);
    }
  }

  const totalRefundAmount = orders.reduce(
    (total, order) => total + (order.refundAmount ?? 0),
    0
  );

  const pendingRefundCount = orders.filter(
    (order) =>
      order.refundStatus === "REQUESTING" ||
      order.refundStatus === "PENDING"
  ).length;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            ECOMMERCE AWS ADMIN
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Quản lý hoàn tiền ZaloPay
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Theo dõi các yêu cầu hoàn tiền từ đơn ZaloPay đã hủy.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Đang tải..." : "Tải lại"}
          </button>

          <Link
            href="/admin/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Dashboard
          </Link>

          <Link
            href="/admin/orders/"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Đơn hàng
          </Link>
        </div>
      </header>

      {errorMessage ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {actionMessage ? (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {actionMessage}
        </p>
      ) : null}

      <section className="mt-8 grid gap-5 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Yêu cầu đang hiển thị</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {isLoading ? "..." : orders.length}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Đang chờ xác nhận</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">
            {isLoading ? "..." : pendingRefundCount}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Tổng tiền đang hiển thị</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {isLoading ? "..." : formatMoney(totalRefundAmount)}
          </p>
        </article>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Danh sách yêu cầu hoàn tiền
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Có thể truy vấn lại các yêu cầu đang chờ ZaloPay xác nhận.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {refundFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => handleFilterChange(item.value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  filter === item.value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Đang tải danh sách hoàn tiền...
          </div>
        ) : null}

        {!isLoading && orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            Không có yêu cầu hoàn tiền phù hợp.
          </div>
        ) : null}

        {!isLoading && orders.length > 0 ? (
          <div className="mt-7 overflow-x-auto">
            <table className="min-w-260 w-full text-left text-sm">
              <thead className="border-y border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Đơn hàng</th>
                  <th className="px-4 py-3 font-semibold">Khách hàng</th>
                  <th className="px-4 py-3 font-semibold">Số tiền</th>
                  <th className="px-4 py-3 font-semibold">Trạng thái</th>
                  <th className="px-4 py-3 font-semibold">Mã hoàn tiền</th>
                  <th className="px-4 py-3 font-semibold">Cập nhật</th>
                  <th className="px-4 py-3 font-semibold">Thao tác</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const canQuery =
                    order.refundStatus === "REQUESTING" ||
                    order.refundStatus === "PENDING";

                  return (
                    <tr key={order.orderId} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {order.orderId}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Đã hủy: {formatDate(order.updatedAt)}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {order.customer.fullName}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {order.customer.email}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {order.customer.phone}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">
                          {formatMoney(order.refundAmount ?? order.total)}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {order.refundReason ?? "Không có lý do"}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getRefundStatusClassName(
                            order.refundStatus
                          )}`}
                        >
                          {order.refundStatus
                            ? refundStatusLabels[order.refundStatus]
                            : "Chưa có"}
                        </span>

                        {order.refundLastMessage ? (
                          <p className="mt-2 max-w-52 text-xs leading-5 text-slate-500">
                            {order.refundLastMessage}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-4 py-4">
                        <p className="max-w-48 break-all font-mono text-xs text-slate-700">
                          {order.refundMerchantId ?? "Chưa có"}
                        </p>

                        {order.refundZaloPayId ? (
                          <p className="mt-2 max-w-48 break-all font-mono text-xs text-slate-500">
                            ZP: {order.refundZaloPayId}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-4 py-4 text-xs text-slate-500">
                        <p>Yêu cầu: {formatDate(order.refundRequestedAt)}</p>
                        <p className="mt-2">
                          Kiểm tra: {formatDate(order.refundLastCheckedAt)}
                        </p>

                        {order.refundCompletedAt ? (
                          <p className="mt-2 font-semibold text-emerald-600">
                            Hoàn tất: {formatDate(order.refundCompletedAt)}
                          </p>
                        ) : null}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-2">
                          {canQuery ? (
                            <button
                              type="button"
                              onClick={() => void handleQueryRefund(order)}
                              disabled={checkingOrderId === order.orderId}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {checkingOrderId === order.orderId
                                ? "Đang kiểm tra..."
                                : "Kiểm tra lại"}
                            </button>
                          ) : null}

                          <Link
                            href={`/admin/order-detail/?orderId=${encodeURIComponent(
                              order.orderId
                            )}`}
                            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                          >
                            Xem đơn
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ):null}
      </section>
    </main>
  );
}

export default function AdminRefundsPage() {
  return (
    <AdminGuard>
      <AdminRefundsContent />
    </AdminGuard>
  );
}
