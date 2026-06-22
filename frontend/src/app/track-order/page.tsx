"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { apiPost } from "@/lib/api";

type OrderStatus =
| "PROCESSING"
| "SHIPPING"
| "COMPLETED"
| "CANCELLED";

type PaymentMethod = "COD" | "BANK_TRANSFER";

type PaymentStatus = "PENDING" | "PAID";

type OrderTrackingResult = {
orderId: string;

customer: {
fullName: string;
phone: string;
};

items: Array<{
productId: string;
name: string;
quantity: number;
salePrice: number;
}>;

subtotal: number;
shippingFee: number;
discount: number;
total: number;

paymentMethod: PaymentMethod;
paymentStatus: PaymentStatus;
orderStatus: OrderStatus;

createdAt: string;
updatedAt?: string;
};

type OrderTrackingResponse = {
data: OrderTrackingResult;
};

const orderStatusLabels: Record<OrderStatus, string> = {
PROCESSING: "Đang xử lý",
SHIPPING: "Đang giao hàng",
COMPLETED: "Đã hoàn thành",
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

export default function TrackOrderPage() {
const [orderId, setOrderId] = useState("");
const [phone, setPhone] = useState("");

const [order, setOrder] = useState<OrderTrackingResult | null>(null);
const [errorMessage, setErrorMessage] = useState("");
const [isSubmitting, setIsSubmitting] = useState(false);

async function handleSubmit(event: FormEvent<HTMLFormElement>) {
event.preventDefault();

setOrder(null);
setErrorMessage("");
setIsSubmitting(true);

try {
  const response = await apiPost<
    OrderTrackingResponse,
    {
      orderId: string;
      phone: string;
    }
  >("/order-tracking", {
    orderId: orderId.trim(),
    phone: phone.trim(),
  });

  setOrder(response.data);
} catch (error) {
  setErrorMessage(
    error instanceof Error
      ? error.message
      : "Không thể tra cứu đơn hàng."
  );
} finally {
  setIsSubmitting(false);
}

}

return ( <main className="mx-auto min-h-screen max-w-4xl px-6 py-12"> <header className="border-b border-slate-200 pb-7"> <p className="text-sm font-semibold text-slate-500">
ECOMMERCE AWS </p>

    <h1 className="mt-2 text-3xl font-bold text-slate-900">
      Tra cứu đơn hàng
    </h1>

    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
      Nhập mã đơn hàng và số điện thoại đã dùng khi đặt hàng để kiểm tra
      trạng thái giao hàng.
    </p>
  </header>

  <section className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
    <form
      onSubmit={handleSubmit}
      className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Mã đơn hàng
        </span>

        <input
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-sm outline-none focus:border-slate-900"
          placeholder="ord_xxxxx"
          required
        />
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-slate-700">
          Số điện thoại
        </span>

        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
          placeholder="0901234567"
          autoComplete="tel"
          inputMode="tel"
          required
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Đang tra cứu..." : "Tra cứu đơn hàng"}
      </button>

      <Link
        href="/products/"
        className="mt-5 inline-block text-sm font-semibold text-slate-600 hover:text-slate-950"
      >
        ← Quay lại cửa hàng
      </Link>
    </form>

    <section className="min-h-80 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {!order && !errorMessage ? (
        <div className="flex min-h-64 items-center justify-center text-center">
          <p className="max-w-sm text-sm leading-6 text-slate-500">
            Thông tin đơn hàng sẽ hiển thị tại đây sau khi bạn tra cứu.
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl bg-red-50 px-4 py-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {order ? (
        <div>
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">Mã đơn hàng</p>

              <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
                {order.orderId}
              </p>
            </div>

            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
              {orderStatusLabels[order.orderStatus]}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Khách hàng
              </p>

              <p className="mt-2 font-semibold text-slate-900">
                {order.customer.fullName}
              </p>

              <p className="mt-1 text-sm text-slate-600">
                {order.customer.phone}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Thời gian đặt
              </p>

              <p className="mt-2 text-sm font-medium text-slate-900">
                {formatDate(order.createdAt)}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Phương thức thanh toán
              </p>

              <p className="mt-2 text-sm font-medium text-slate-900">
                {order.paymentMethod === "COD"
                  ? "Thanh toán khi nhận hàng"
                  : "Chuyển khoản"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Trạng thái thanh toán
              </p>

              <p className="mt-2 text-sm font-medium text-slate-900">
                {order.paymentStatus === "PAID"
                  ? "Đã thanh toán"
                  : "Chờ thanh toán"}
              </p>
            </div>
          </div>

          <div className="mt-7 border-t border-slate-200 pt-5">
            <p className="text-sm font-semibold text-slate-900">
              Sản phẩm đã đặt
            </p>

            <ul className="mt-4 divide-y divide-slate-100">
              {order.items.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {item.name}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Số lượng: {item.quantity}
                    </p>
                  </div>

                  <p className="text-right text-sm font-semibold text-slate-900">
                    {formatMoney(item.salePrice * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 space-y-2 border-t border-slate-200 pt-5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Tạm tính</span>
              <span>{formatMoney(order.subtotal)}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>Phí vận chuyển</span>
              <span>{formatMoney(order.shippingFee)}</span>
            </div>

            <div className="flex justify-between text-slate-600">
              <span>Giảm giá</span>
              <span>-{formatMoney(order.discount)}</span>
            </div>

            <div className="flex justify-between border-t border-slate-200 pt-3 text-lg font-bold text-slate-900">
              <span>Tổng cộng</span>
              <span>{formatMoney(order.total)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  </section>
</main>

);
}
