"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CustomerAccountMenu } from "@/components/customer/CustomerAccountMenu";
import { CustomerAuthError } from "@/lib/customer-auth";
import { customerGet, customerPatch } from "@/lib/customer-api";
import type {
  Order,
  OrderStatus,
  ShippingCarrier,
} from "@/types/order";

type OrderResponse = {
  data: Order;
};

const orderStatusLabels: Record<OrderStatus, string> = {
  PROCESSING: "Đang xử lý",
  SHIPPING: "Đang giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

const shippingCarrierLabels: Record<ShippingCarrier, string> = {
  GHN: "Giao Hàng Nhanh",
  GHTK: "Giao Hàng Tiết Kiệm",
  JNT: "J&T Express",
  VIETTEL_POST: "Viettel Post",
  OTHER: "Đơn vị khác",
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

function getPaymentMethodLabel(order: Order): string {
  if (order.paymentMethod === "COD") {
    return "Thanh toán khi nhận hàng";
  }

  if (order.paymentMethod === "ZALOPAY") {
    return "ZaloPay";
  }

  return "Chuyển khoản ngân hàng";
}

function getShippingCarrierLabel(order: Order): string {
  if (!order.shippingCarrier) {
    return "Chưa cập nhật";
  }

  if (
    order.shippingCarrier === "OTHER" &&
    order.shippingCarrierName?.trim()
  ) {
    return order.shippingCarrierName;
  }

  return shippingCarrierLabels[order.shippingCarrier];
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

function CustomerOrderDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId")?.trim() ?? "";

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(orderId));
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
  if (!orderId) {
    return;
  }

    let isMounted = true;

    const timerId = window.setTimeout(() => {
      async function loadOrder() {
        try {
          const response = await customerGet<OrderResponse>(
            `/account/orders/${encodeURIComponent(orderId)}`
          );

          if (!isMounted) {
            return;
          }

          setOrder(response.data);
          setErrorMessage("");
        } catch (error) {
          if (!isMounted) {
            return;
          }

          if (error instanceof CustomerAuthError) {
            router.replace("/account/login/");
            return;
          }

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Không thể tải chi tiết đơn hàng."
          );
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      }

      void loadOrder();
    }, 0);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
    };
  }, [orderId, router]);


  async function handleCancelOrder() {
    if (!order || order.orderStatus !== "PROCESSING") {
      return;
    }

    const paymentWarning =
      order.paymentStatus === "PAID"
        ? "\n\nKhoản thanh toán đã được ghi nhận. Shop sẽ kiểm tra và xử lý hoàn tiền theo chính sách hiện hành."
        : "";

    const confirmed = window.confirm(
      `Bạn có chắc muốn hủy đơn hàng ${order.orderId}? Tồn kho sẽ được hoàn lại.${paymentWarning}`
    );

    if (!confirmed) {
      return;
    }

    setIsCancelling(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await customerPatch<
        OrderResponse,
        Record<string, never>
      >(`/account/orders/${encodeURIComponent(order.orderId)}/cancel`, {});

      setOrder(response.data);
      setSuccessMessage(
        response.data.paymentStatus === "PAID"
          ? "Đơn hàng đã được hủy. Shop sẽ kiểm tra và xử lý hoàn tiền theo chính sách hiện hành."
          : "Đơn hàng đã được hủy thành công."
      );
    } catch (error) {
      if (error instanceof CustomerAuthError) {
        router.replace(
          `/account/login/?returnTo=${encodeURIComponent(
            `/account/order-detail/?orderId=${order.orderId}`
          )}`
        );
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể hủy đơn hàng."
      );
    } finally {
      setIsCancelling(false);
    }
  }

  const itemSubtotal = useMemo(() => {
    if (!order) {
      return 0;
    }

    return order.items.reduce(
      (total, item) => total + item.salePrice * item.quantity,
      0
    );
  }, [order]);

  const statusHistory = useMemo(() => {
    if (!order) {
      return [];
    }

    const history = Array.isArray(order.statusHistory)
      ? [...order.statusHistory]
      : [];

    if (history.length === 0) {
      history.push({
        status: "PROCESSING",
        changedAt: order.createdAt,
      });
    }

    return history.sort((first, second) => {
      return (
        new Date(first.changedAt).getTime() -
        new Date(second.changedAt).getTime()
      );
    });
  }, [order]);

  if (!orderId) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12">
        <section className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-7">
          <h1 className="text-2xl font-bold text-amber-900">
            Chưa có mã đơn hàng
          </h1>

          <p className="mt-3 text-sm text-amber-800">
            Hãy quay lại danh sách đơn hàng để chọn đơn cần xem.
          </p>

          <Link
            href="/account/orders/"
            className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Đơn hàng của tôi
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/products/" className="text-2xl font-bold text-slate-950">
            AWS Shop
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/account/orders/"
              className="hidden text-sm font-semibold text-slate-600 hover:text-slate-950 sm:block"
            >
              Đơn hàng của tôi
            </Link>

            <CustomerAccountMenu />

            <Link
              href="/cart/"
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
            >
              Giỏ hàng
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link
          href="/account/orders/"
          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          ← Quay lại đơn hàng của tôi
        </Link>

        <div className="mt-5 flex flex-col gap-4 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">
              TÀI KHOẢN CỦA TÔI
            </p>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              Chi tiết đơn hàng
            </h1>

            <p className="mt-3 break-all font-mono text-sm text-slate-600">
              {orderId}
            </p>
          </div>

          {order ? (
            <span
              className={`w-fit rounded-lg px-4 py-2 text-sm font-semibold ${getStatusClassName(
                order.orderStatus
              )}`}
            >
              {orderStatusLabels[order.orderStatus]}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-sm text-slate-500">
            Đang tải chi tiết đơn hàng...
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mt-8 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        {!isLoading && !errorMessage && !order ? (
          <p className="py-20 text-center text-sm text-slate-500">
            Không tìm thấy đơn hàng.
          </p>
        ) : null}

        {!isLoading && order ? (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-8">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-6 py-5">
                  <h2 className="text-xl font-bold text-slate-900">
                    Sản phẩm đã đặt
                  </h2>
                </div>

                <div className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-start justify-between gap-5 px-6 py-5"
                    >
                      <div>
                        <Link
                          href={`/products/${item.slug}/`}
                          className="font-semibold text-slate-900 hover:text-blue-600"
                        >
                          {item.name}
                        </Link>

                        <p className="mt-1 text-sm text-slate-500">
                          {formatMoney(item.salePrice)} × {item.quantity}
                        </p>
                      </div>

                      <p className="font-bold text-slate-900">
                        {formatMoney(item.salePrice * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-t border-slate-200 px-6 py-5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Tạm tính</span>
                    <span>{formatMoney(order.subtotal || itemSubtotal)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Phí vận chuyển</span>
                    <span>{formatMoney(order.shippingFee)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Giảm giá</span>
                    <span>-{formatMoney(order.discount)}</span>
                  </div>

                  <div className="flex justify-between border-t border-slate-200 pt-4 text-lg font-bold text-slate-900">
                    <span>Tổng cộng</span>
                    <span>{formatMoney(order.total)}</span>
                  </div>
                </div>
              </section>

              {order.orderStatus === "PROCESSING" ? (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-amber-950">
                    Hủy đơn hàng
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-amber-900">
                    Bạn có thể hủy đơn khi shop chưa bắt đầu giao hàng. Sản phẩm
                    sẽ được hoàn lại tồn kho.
                  </p>

                  {order.paymentStatus === "PAID" ? (
                    <p className="mt-3 text-sm leading-6 text-amber-900">
                      Khoản thanh toán đã được ghi nhận. Shop sẽ kiểm tra và xử
                      lý hoàn tiền theo chính sách hiện hành.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void handleCancelOrder()}
                    disabled={isCancelling}
                    className="mt-5 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCancelling ? "Đang hủy đơn..." : "Hủy đơn hàng"}
                  </button>
                </section>
              ) : null}

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900">
                  Hành trình đơn hàng
                </h2>

                <ol className="mt-6 space-y-5 border-l-2 border-slate-200 pl-6">
                  {statusHistory.map((historyItem, index) => {
                    const isLatest =
                      index === statusHistory.length - 1;

                    return (
                      <li
                        key={`${historyItem.status}-${historyItem.changedAt}-${index}`}
                        className="relative"
                      >
                        <span
                          className={`absolute -left-7.75 top-1.5 h-3 w-3 rounded-full ${
                            isLatest ? "bg-slate-900" : "bg-emerald-500"
                          }`}
                        />

                        <p className="font-semibold text-slate-900">
                          {orderStatusLabels[historyItem.status]}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {formatDate(historyItem.changedAt)}
                        </p>

                        {isLatest ? (
                          <p className="mt-1 text-xs font-semibold text-emerald-600">
                            Trạng thái hiện tại
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">
                  Thông tin vận chuyển
                </h2>

                <div className="mt-5 space-y-4 text-sm">
                  <div>
                    <p className="text-slate-500">Đơn vị giao hàng</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {getShippingCarrierLabel(order)}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-500">Mã vận đơn</p>
                    <p className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
                      {order.shippingTrackingCode ?? "Chưa có"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-500">Thời gian bàn giao</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatDate(order.shippedAt)}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">
                  Thanh toán
                </h2>

                <div className="mt-5 space-y-4 text-sm">
                  <div>
                    <p className="text-slate-500">Phương thức</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {getPaymentMethodLabel(order)}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-500">Trạng thái</p>
                    <p
                      className={`mt-1 font-semibold ${
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
                    <p className="text-slate-500">Thời gian thanh toán</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatDate(order.paidAt)}
                    </p>
                  </div>

                  {order.paymentTransactionId ? (
                    <div>
                      <p className="text-slate-500">Mã giao dịch</p>
                      <p className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
                        {order.paymentTransactionId}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-slate-900">
                  Thông tin nhận hàng
                </h2>

                <div className="mt-5 space-y-4 text-sm">
                  <div>
                    <p className="text-slate-500">Người nhận</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {order.customer.fullName}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-500">Số điện thoại</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {order.customer.phone}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-500">Địa chỉ</p>
                    <p className="mt-1 leading-6 text-slate-900">
                      {order.customer.address}
                    </p>
                  </div>

                  {order.customer.note ? (
                    <div>
                      <p className="text-slate-500">Ghi chú</p>
                      <p className="mt-1 leading-6 text-slate-900">
                        {order.customer.note}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </main>
    </main>
  );
}

export default function CustomerOrderDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-500">
            Đang tải trang chi tiết đơn hàng...
          </p>
        </main>
      }
    >
      <CustomerOrderDetailContent />
    </Suspense>
  );
}