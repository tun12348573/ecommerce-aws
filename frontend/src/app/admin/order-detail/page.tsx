"use client";

import Link from "next/link";
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminAuthError } from "@/lib/admin-auth";
import { adminGet, adminPatch } from "@/lib/admin-api";
import type {
  Order,
  OrderStatus,
  ShippingCarrier,
} from "@/types/order";

type OrderResponse = {
  data: Order;
};

type ShippingUpdatePayload = {
  shippingCarrier: ShippingCarrier;
  shippingCarrierName?: string;
  shippingTrackingCode: string;
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

function AdminOrderDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId")?.trim() ?? "";

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(orderId));
  const [isSavingShipping, setIsSavingShipping] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AdminAuthError) {
        router.replace("/admin/login");
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể tải chi tiết đơn hàng."
      );
    },
    [router]
  );

  const fetchOrder = useCallback(async (targetOrderId: string) => {
    return adminGet<OrderResponse>(
      `/admin/orders/${encodeURIComponent(targetOrderId)}`
    );
  }, []);

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let isMounted = true;

    async function loadOrder() {
      try {
        const response = await fetchOrder(orderId);

        if (!isMounted) {
          return;
        }

        setOrder(response.data);
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

    void loadOrder();

    return () => {
      isMounted = false;
    };
  }, [fetchOrder, handleError, orderId]);

  async function handleRefresh() {
    if (!orderId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetchOrder(orderId);
      setOrder(response.data);
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleShippingSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!order) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    const shippingCarrier = formData.get("shippingCarrier");
    const shippingCarrierName = formData.get("shippingCarrierName");
    const shippingTrackingCode = formData.get("shippingTrackingCode");

    if (
      typeof shippingCarrier !== "string" ||
      typeof shippingTrackingCode !== "string"
    ) {
      setErrorMessage("Thông tin vận chuyển không hợp lệ.");
      return;
    }

    const validShippingCarriers: ShippingCarrier[] = [
      "GHN",
      "GHTK",
      "JNT",
      "VIETTEL_POST",
      "OTHER",
    ];

    if (
      !validShippingCarriers.includes(
        shippingCarrier as ShippingCarrier
      )
    ) {
      setErrorMessage("Đơn vị giao hàng không hợp lệ.");
      return;
    }

    const carrier = shippingCarrier as ShippingCarrier;
    const carrierName =
      typeof shippingCarrierName === "string"
        ? shippingCarrierName.trim()
        : "";

    if (carrier === "OTHER" && !carrierName) {
      setErrorMessage("Vui lòng nhập tên đơn vị giao hàng khác.");
      return;
    }

    if (shippingTrackingCode.trim().length < 3) {
      setErrorMessage("Mã vận đơn phải có ít nhất 3 ký tự.");
      return;
    }

    setIsSavingShipping(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await adminPatch<
        OrderResponse,
        ShippingUpdatePayload
      >(`/admin/orders/${order.orderId}/shipping`, {
        shippingCarrier: carrier,
        shippingCarrierName:
          carrier === "OTHER" ? carrierName : undefined,
        shippingTrackingCode: shippingTrackingCode.trim(),
      });

      setOrder(response.data);
      setSuccessMessage(
        "Đã lưu thông tin vận chuyển và cập nhật đơn sang Đang giao."
      );
    } catch (error) {
      handleError(error);
    } finally {
      setIsSavingShipping(false);
    }
  }

  const itemSubtotal = useMemo(() => {
    if (!order) {
      return 0;
    }

    return order.items.reduce((total, item) => {
      return total + item.salePrice * item.quantity;
    }, 0);
  }, [order]);

  const shippingFee = order ? Math.max(order.total - itemSubtotal, 0) : 0;

  const statusHistory = useMemo(() => {
    if (!order?.statusHistory) {
      return [];
    }

    return [...order.statusHistory].sort((first, second) => {
      return (
        new Date(first.changedAt).getTime() -
        new Date(second.changedAt).getTime()
      );
    });
  }, [order]);

  const canUpdateShipping =
    order?.orderStatus === "PROCESSING" ||
    order?.orderStatus === "SHIPPING";

  if (!orderId) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-bold text-amber-900">
            Chưa có mã đơn hàng
          </h1>

          <p className="mt-2 text-sm text-amber-800">
            Hãy quay lại trang quản lý đơn hàng và chọn một đơn để xem chi
            tiết.
          </p>

          <Link
            href="/admin/orders/"
            className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Quay lại đơn hàng
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            ECOMMERCE AWS ADMIN
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Chi tiết đơn hàng
          </h1>

          <p className="mt-2 break-all font-mono text-sm text-slate-600">
            {orderId}
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
            href="/admin/orders/"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            ← Quản lý đơn hàng
          </Link>
        </div>
      </header>

      {errorMessage ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}

      {isLoading ? (
        <div className="py-20 text-center text-sm text-slate-500">
          Đang tải chi tiết đơn hàng...
        </div>
      ) : null}

      {!isLoading && !order && !errorMessage ? (
        <div className="py-20 text-center text-sm text-slate-500">
          Không tìm thấy đơn hàng.
        </div>
      ) : null}

      {!isLoading && order ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-8">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <h2 className="text-xl font-bold text-slate-900">
                  Sản phẩm đã mua
                </h2>
              </div>

              <div className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-start justify-between gap-5 px-6 py-5"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {item.name}
                      </p>

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
                  <span>{formatMoney(itemSubtotal)}</span>
                </div>

                <div className="flex justify-between text-slate-600">
                  <span>Phí vận chuyển</span>
                  <span>{formatMoney(shippingFee)}</span>
                </div>

                <div className="flex justify-between border-t border-slate-200 pt-4 text-lg font-bold text-slate-900">
                  <span>Tổng cộng</span>
                  <span>{formatMoney(order.total)}</span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">
                Cập nhật vận chuyển
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Lưu mã vận đơn sẽ tự động chuyển đơn sang trạng thái Đang giao.
              </p>

              {canUpdateShipping ? (
                <form
                  key={`${order.orderId}-${order.updatedAt ?? order.createdAt}`}
                  onSubmit={handleShippingSubmit}
                  className="mt-6 space-y-5"
                >
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Đơn vị giao hàng
                    </label>

                    <select
                      name="shippingCarrier"
                      defaultValue={order.shippingCarrier ?? "GHN"}
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900"
                    >
                      <option value="GHN">Giao Hàng Nhanh</option>
                      <option value="GHTK">Giao Hàng Tiết Kiệm</option>
                      <option value="JNT">J&T Express</option>
                      <option value="VIETTEL_POST">Viettel Post</option>
                      <option value="OTHER">Đơn vị khác</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Tên đơn vị khác
                    </label>

                    <input
                      name="shippingCarrierName"
                      defaultValue={order.shippingCarrierName ?? ""}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900"
                      placeholder="Chỉ nhập khi chọn Đơn vị khác"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      Mã vận đơn
                    </label>

                    <input
                      required
                      name="shippingTrackingCode"
                      defaultValue={order.shippingTrackingCode ?? ""}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 font-mono text-sm outline-none focus:border-slate-900"
                      placeholder="Ví dụ: GHN123456789"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingShipping}
                    className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingShipping
                      ? "Đang lưu..."
                      : order.orderStatus === "SHIPPING"
                        ? "Lưu mã vận đơn"
                        : "Lưu và chuyển sang Đang giao"}
                  </button>
                </form>
              ) : (
                <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Đơn đã hoàn thành hoặc đã hủy nên không thể cập nhật vận
                  chuyển.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-900">
                Timeline trạng thái đơn
              </h2>

              {statusHistory.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Chưa có dữ liệu lịch sử trạng thái.
                </p>
              ) : (
                <ol className="mt-6 space-y-5 border-l-2 border-slate-200 pl-6">
                  {statusHistory.map((historyItem, index) => (
                    <li
                      key={`${historyItem.status}-${historyItem.changedAt}`}
                      className="relative"
                    >
                      <span className="absolute -left-7.75 top-1.5 h-3 w-3 rounded-full bg-slate-900" />

                      <p className="font-semibold text-slate-900">
                        {orderStatusLabels[historyItem.status]}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {formatDate(historyItem.changedAt)}
                      </p>

                      {index === statusHistory.length - 1 ? (
                        <p className="mt-1 text-xs font-semibold text-emerald-600">
                          Trạng thái hiện tại
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">
                Trạng thái đơn
              </h2>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-slate-500">Vận chuyển</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {orderStatusLabels[order.orderStatus]}
                  </p>
                </div>

                <div>
                  <p className="text-slate-500">Thanh toán</p>
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
                  <p className="text-slate-500">Phương thức</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {getPaymentMethodLabel(order)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">
                Thông tin vận chuyển
              </h2>

              <div className="mt-4 space-y-4 text-sm">
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
                Thông tin khách hàng
              </h2>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-slate-500">Họ và tên</p>
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
                  <p className="text-slate-500">Email</p>
                  <p className="mt-1 break-all font-semibold text-slate-900">
                    {order.customer.email}
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

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">
                Thông tin thanh toán
              </h2>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-slate-500">Ngày tạo đơn</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatDate(order.createdAt)}
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

                {order.zalopayAppTransId ? (
                  <div>
                    <p className="text-slate-500">ZaloPay App Trans ID</p>
                    <p className="mt-1 break-all font-mono text-xs font-semibold text-slate-900">
                      {order.zalopayAppTransId}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

export default function AdminOrderDetailPage() {
  return (
    <AdminGuard>
      <Suspense
        fallback={
          <main className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-slate-500">
              Đang tải trang chi tiết đơn hàng...
            </p>
          </main>
        }
      >
        <AdminOrderDetailContent />
      </Suspense>
    </AdminGuard>
  );
}