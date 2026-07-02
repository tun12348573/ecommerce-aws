"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CustomerAuthError, signOutCustomer } from "@/lib/customer-auth";
import { customerGet } from "@/lib/customer-api";
import type { Order, OrderStatus } from "@/types/order";

type OrdersResponse = {
  data: Order[];
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

function getPaymentMethodLabel(order: Order): string {
  if (order.paymentMethod === "COD") {
    return "Thanh toán khi nhận hàng";
  }

  if (order.paymentMethod === "ZALOPAY") {
    return "ZaloPay";
  }

  return "Chuyển khoản ngân hàng";
}

function getStatusClassName(orderStatus: OrderStatus): string {
  if (orderStatus === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (orderStatus === "CANCELLED") {
    return "bg-red-50 text-red-700";
  }

  if (orderStatus === "SHIPPING") {
    return "bg-blue-50 text-blue-700";
  }

  return "bg-amber-50 text-amber-700";
}

export default function CustomerOrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    const timerId = window.setTimeout(() => {
      async function loadOrders() {
        try {
          const response = await customerGet<OrdersResponse>("/account/orders");

          if (!isMounted) {
            return;
          }

          setOrders(response.data);
          setErrorMessage("");
        } catch (error) {
          if (!isMounted) {
            return;
          }

          if (error instanceof CustomerAuthError) {
            router.replace(
              "/account/login/?returnTo=%2Faccount%2Forders%2F"
            );

            return;
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Không thể tải lịch sử đơn hàng."
          );
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      }

      void loadOrders();
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [router]);

  function handleSignOut() {
    signOutCustomer();
    router.replace("/products/");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/products/"
              className="text-xl font-bold text-slate-950"
            >
              AWS Shop
            </Link>

            <p className="mt-1 text-sm text-slate-500">
              Lịch sử đơn hàng của tôi
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/products/"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Tiếp tục mua sắm
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">
              TÀI KHOẢN CỦA TÔI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Đơn hàng của tôi
            </h1>
          </div>

          <Link
            href="/track-order/"
            className="text-sm font-semibold text-slate-700 underline"
          >
            Tra cứu đơn vãng lai
          </Link>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-sm text-slate-500">
            Đang tải lịch sử đơn hàng...
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-7 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {!isLoading && !errorMessage && orders.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="text-xl font-bold text-slate-900">
              Chưa có đơn hàng nào
            </h2>

            <p className="mt-3 text-sm text-slate-600">
              Các đơn được tạo sau khi bạn đăng nhập sẽ hiển thị ở đây.
            </p>

            <Link
              href="/products/"
              className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Mua sắm ngay
            </Link>
          </section>
        ) : null}

        {!isLoading && !errorMessage && orders.length > 0 ? (
          <section className="mt-8 space-y-5">
            {orders.map((order) => (
              <article
                key={order.orderId}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-5 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Mã đơn hàng</p>

                    <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
                      {order.orderId}
                    </p>

                    <p className="mt-2 text-sm text-slate-500">
                      Đặt lúc {formatDate(order.createdAt)}
                    </p>
                  </div>

                  <div
                    className={`w-fit rounded-lg px-3 py-2 text-sm font-semibold ${getStatusClassName(
                      order.orderStatus
                    )}`}
                  >
                    {orderStatusLabels[order.orderStatus]}
                  </div>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Sản phẩm
                    </p>

                    <p className="mt-2 font-semibold text-slate-900">
                      {order.items[0]?.name ?? "Đơn hàng"}
                    </p>

                    {order.items.length > 1 ? (
                      <p className="mt-1 text-sm text-slate-500">
                        và {order.items.length - 1} sản phẩm khác
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Thanh toán
                    </p>

                    <p className="mt-2 font-semibold text-slate-900">
                      {getPaymentMethodLabel(order)}
                    </p>

                    <p
                      className={`mt-1 text-sm font-medium ${
                        order.paymentStatus === "PAID"
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    >
                      {order.paymentStatus === "PAID"
                        ? "Đã thanh toán"
                        : "Chờ thanh toán"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tổng cộng
                    </p>

                    <p className="mt-2 text-lg font-bold text-slate-900">
                      {formatMoney(order.total)}
                    </p>

                    {order.shippingTrackingCode ? (
                      <p className="mt-1 text-sm text-slate-500">
                        Mã vận đơn:{" "}
                        <span className="font-mono font-semibold">
                          {order.shippingTrackingCode}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-5">
                  <Link
                    href={`/track-order/?orderId=${encodeURIComponent(
                      order.orderId
                    )}`}
                    className="text-sm font-semibold text-slate-700 underline"
                  >
                    Tra cứu hành trình đơn hàng
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </main>
    </main>
  );
}
