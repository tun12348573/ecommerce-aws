"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiPatch } from "@/lib/api";
import type { Order } from "@/types/order";

type AdminOrdersClientProps = {
  initialOrders: Order[];
};

type OrderStatus = Order["orderStatus"];

type OrderResponse = {
  data: Order;
};

const orderStatuses: OrderStatus[] = [
  "PROCESSING",
  "SHIPPING",
  "COMPLETED",
  "CANCELLED",
];

const orderStatusLabels: Record<OrderStatus, string> = {
  PROCESSING: "Đang xử lý",
  SHIPPING: "Đang giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminOrdersClient({ initialOrders }: AdminOrdersClientProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const totalRevenue = useMemo(() => {
    return orders
      .filter((order) => order.orderStatus !== "CANCELLED")
      .reduce((total, order) => total + order.total, 0);
  }, [orders]);

  async function handleUpdateStatus(orderId: string, orderStatus: OrderStatus) {
    setError("");
    setUpdatingOrderId(orderId);

    try {
      const response = await apiPatch<
        OrderResponse,
        {
          orderStatus: OrderStatus;
        }
      >(`/admin/orders/${orderId}/status`, {
        orderStatus,
      });

      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.orderId === orderId ? response.data : order
        )
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật trạng thái đơn hàng."
      );
    } finally {
      setUpdatingOrderId(null);
    }
  }

  return (
    <div>
      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm font-bold uppercase text-blue-600">
            Tổng đơn
          </p>
          <p className="text-3xl font-extrabold">{orders.length}</p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm font-bold uppercase text-blue-600">
            Doanh thu tạm tính
          </p>
          <p className="text-3xl font-extrabold text-red-600">
            {formatPrice(totalRevenue)}
          </p>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="mb-2 text-sm font-bold uppercase text-blue-600">
            Đơn đang xử lý
          </p>
          <p className="text-3xl font-extrabold">
            {
              orders.filter((order) => order.orderStatus === "PROCESSING")
                .length
            }
          </p>
        </div>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-600">
          {error}
        </div>
      ) : null}

      {orders.length === 0 ? (
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          <h2 className="mb-3 text-2xl font-bold">Chưa có đơn hàng</h2>

          <p className="mb-6 text-gray-600">
            Hãy thử đặt một đơn hàng từ trang checkout trước.
          </p>

          <Link
            href="/products"
            className="inline-block rounded-xl bg-black px-6 py-3 text-sm font-bold text-white"
          >
            Tạo đơn hàng thử
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-250 border-collapse text-left text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-5 py-4 font-bold">Mã đơn</th>
                  <th className="px-5 py-4 font-bold">Khách hàng</th>
                  <th className="px-5 py-4 font-bold">Sản phẩm</th>
                  <th className="px-5 py-4 font-bold">Tổng tiền</th>
                  <th className="px-5 py-4 font-bold">Thanh toán</th>
                  <th className="px-5 py-4 font-bold">Trạng thái</th>
                  <th className="px-5 py-4 font-bold">Ngày tạo</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderId} className="border-t">
                    <td className="px-5 py-4 font-bold">{order.orderId}</td>

                    <td className="px-5 py-4">
                      <p className="font-bold">{order.customer.fullName}</p>
                      <p className="text-gray-600">{order.customer.phone}</p>
                      <p className="text-gray-600">{order.customer.email}</p>
                    </td>

                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        {order.items.map((item) => (
                          <p key={item.productId}>
                            {item.name} × {item.quantity}
                          </p>
                        ))}
                      </div>
                    </td>

                    <td className="px-5 py-4 font-bold text-red-600">
                      {formatPrice(order.total)}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-bold">{order.paymentMethod}</p>
                      <p className="text-gray-600">{order.paymentStatus}</p>
                    </td>

                    <td className="px-5 py-4">
                      <select
                        value={order.orderStatus}
                        disabled={updatingOrderId === order.orderId}
                        onChange={(event) =>
                          handleUpdateStatus(
                            order.orderId,
                            event.target.value as OrderStatus
                          )
                        }
                        className="rounded-xl border bg-white px-3 py-2 text-sm font-bold"
                      >
                        {orderStatuses.map((status) => (
                          <option key={status} value={status}>
                            {orderStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-5 py-4 text-gray-600">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}