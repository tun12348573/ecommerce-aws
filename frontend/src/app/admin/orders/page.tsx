"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminAuthError } from "@/lib/admin-auth";
import { adminGet, adminPatch } from "@/lib/admin-api";
import type { Order, OrderStatus } from "@/types/order";

type OrdersResponse = {
data: Order[];
};

type OrderResponse = {
data: Order;
};

const orderStatusLabels: Record<OrderStatus, string> = {
PROCESSING: "Đang xử lý",
SHIPPING: "Đang giao",
COMPLETED: "Hoàn thành",
CANCELLED: "Đã hủy",
};

function formatMoney(value: number): string {
return new Intl.NumberFormat("vi-VN", {
style: "currency",
currency: "VND",
maximumFractionDigits: 0,
}).format(value);
}

function formatDate(value: string): string {
return new Date(value).toLocaleString("vi-VN");
}

function AdminOrdersContent() {
const router = useRouter();

const [orders, setOrders] = useState<Order[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [errorMessage, setErrorMessage] = useState("");
const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

const handleError = useCallback(
(error: unknown) => {
if (error instanceof AdminAuthError) {
router.replace("/admin/login");
return;
}

  setErrorMessage(
    error instanceof Error
      ? error.message
      : "Không thể kết nối đến Admin API."
  );
},
[router]

);

const fetchOrders = useCallback(async () => {
const response = await adminGet<OrdersResponse>("/admin/orders");

return response.data;

}, []);

useEffect(() => {
let isMounted = true;

async function loadInitialOrders() {
  try {
    const data = await fetchOrders();

    if (isMounted) {
      setOrders(data);
      setErrorMessage("");
    }
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

void loadInitialOrders();

return () => {
  isMounted = false;
};

}, [fetchOrders, handleError]);

const totalOrderValue = useMemo(() => {
return orders
.filter((order) => order.orderStatus !== "CANCELLED")
.reduce((total, order) => total + order.total, 0);
}, [orders]);

async function handleRefresh() {
setIsLoading(true);
setErrorMessage("");

try {
  const data = await fetchOrders();

  setOrders(data);
} catch (error) {
  handleError(error);
} finally {
  setIsLoading(false);
}

}

async function handleStatusChange(
orderId: string,
orderStatus: OrderStatus
) {
setErrorMessage("");
setUpdatingOrderId(orderId);

try {
  const response = await adminPatch<
    OrderResponse,
    { orderStatus: OrderStatus }
  >(`/admin/orders/${orderId}/status`, {
    orderStatus,
  });

  setOrders((currentOrders) =>
    currentOrders.map((order) =>
      order.orderId === orderId ? response.data : order
    )
  );
} catch (error) {
  handleError(error);
} finally {
  setUpdatingOrderId(null);
}

}

return ( <main className="mx-auto min-h-screen max-w-7xl px-6 py-10"> <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between"> <div> <p className="text-sm font-semibold text-slate-500">
ECOMMERCE AWS ADMIN </p>
      <h1 className="mt-1 text-3xl font-bold text-slate-900">
        Quản lý đơn hàng
      </h1>

      <p className="mt-2 text-sm text-slate-600">
        Dữ liệu được lấy từ DynamoDB qua API Gateway và Cognito JWT.
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
        href="/admin"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        ← Dashboard
      </Link>
    </div>
  </header>

  <section className="mt-8 grid gap-5 sm:grid-cols-2">
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        Tổng số đơn hàng
      </p>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {isLoading ? "..." : orders.length}
      </p>
    </article>

    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        Tổng giá trị đơn hợp lệ
      </p>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {isLoading ? "..." : formatMoney(totalOrderValue)}
      </p>

      <p className="mt-2 text-sm text-slate-500">
        Không tính các đơn đã hủy.
      </p>
    </article>
  </section>

  {errorMessage ? (
    <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {errorMessage}
    </p>
  ) : null}

  <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-5 py-4 font-semibold">Mã đơn</th>
            <th className="px-5 py-4 font-semibold">Khách hàng</th>
            <th className="px-5 py-4 font-semibold">Tổng tiền</th>
            <th className="px-5 py-4 font-semibold">Thanh toán</th>
            <th className="px-5 py-4 font-semibold">Trạng thái</th>
            <th className="px-5 py-4 font-semibold">Ngày tạo</th>
            <th className="px-5 py-4 font-semibold">Chi tiết</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {isLoading ? (
            <tr>
              <td
                colSpan={7}
                className="px-5 py-10 text-center text-slate-500"
              >
                Đang tải đơn hàng...
              </td>
            </tr>
          ) : null}

          {!isLoading && orders.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-5 py-10 text-center text-slate-500"
              >
                Chưa có đơn hàng nào.
              </td>
            </tr>
          ) : null}

          {!isLoading
            ? orders.map((order) => (
                <tr key={order.orderId} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-mono text-xs font-semibold text-slate-800">
                      {order.orderId}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {Array.isArray(order.items) ? order.items.length : 0} sản phẩm
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {order.customer?.fullName || "Chưa có tên khách hàng"}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {order.customer?.phone || "Chưa có số điện thoại"}
                    </p>

                    <p className="mt-1 max-w-xs text-xs text-slate-500">
                      {order.customer?.address || "Chưa có địa chỉ"}
                    </p>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {formatMoney(order.total)}
                  </td>

                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">
                      {order.paymentMethod === "COD"
                        ? "Thanh toán khi nhận hàng"
                        : order.paymentMethod === "ZALOPAY"
                          ? "ZaloPay"
                          : "Chuyển khoản ngân hàng"}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {order.paymentStatus === "PAID"
                        ? "Đã thanh toán"
                        : "Chờ thanh toán"}
                    </p>
                  </td>

                  <td className="px-5 py-4">
                    <select
                      value={order.orderStatus}
                      disabled={updatingOrderId === order.orderId}
                      onChange={(event) => {
                        void handleStatusChange(
                          order.orderId,
                          event.target.value as OrderStatus
                        );
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {(Object.keys(orderStatusLabels) as OrderStatus[]).map(
                        (status) => (
                          <option key={status} value={status}>
                            {orderStatusLabels[status]}
                          </option>
                        )
                      )}
                    </select>
                  </td>

                  <td className="px-5 py-4 text-xs text-slate-500">
                    {formatDate(order.createdAt)}
                  </td>

                  <td className="px-5 py-4">
                    <Link
                      href={`/admin/order-detail/?orderId=${encodeURIComponent(
                      order.orderId
                    )}`}
                      className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Xem chi tiết
                    </Link>
                  </td>
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  </section>
</main>

);
}

export default function AdminOrdersPage() {
return ( <AdminGuard> <AdminOrdersContent /> </AdminGuard>
);
}
