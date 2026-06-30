"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { apiPost } from "@/lib/api";

type PaymentMethod = "COD" | "BANK_TRANSFER" | "ZALOPAY";

type PaymentStatus = "PENDING" | "PAID";

type ZaloPayQueryResponse = {
  data: {
    orderId?: string;
    paymentStatus?: PaymentStatus;
    paidAt?: string;
    paymentTransactionId?: string;
    zalopayStatus?: number;
    zalopayMessage?: string;
  };
};

type ZaloPaymentCheckState =
  | "CHECKING"
  | "PAID"
  | "PENDING"
  | "ERROR"
  | "SETUP_FAILED";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("vi-VN");
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId");

  const paymentMethod = searchParams.get(
    "paymentMethod"
  ) as PaymentMethod | null;

  const isZaloPay = paymentMethod === "ZALOPAY";

  const paymentSetupFailed =
    searchParams.get("paymentSetup") === "failed";

  const [paymentState, setPaymentState] =
    useState<ZaloPaymentCheckState>("CHECKING");

  const [message, setMessage] = useState("");
  const [paidAt, setPaidAt] = useState<string | null>(null);

  const checkZaloPayPayment = useCallback(async () => {
    if (!orderId) {
      return;
    }

    const phone = window.sessionStorage.getItem(
      `aws-shop-zalopay-phone:${orderId}`
    );

    if (!phone) {
      setPaymentState("PENDING");
      setMessage(
        "Không thể tự kiểm tra thanh toán trên thiết bị này. Hãy dùng trang Tra cứu đơn hàng với mã đơn và số điện thoại."
      );
      return;
    }

    setPaymentState("CHECKING");
    setMessage("Đang kiểm tra trạng thái thanh toán ZaloPay...");

    try {
      const response = await apiPost<
        ZaloPayQueryResponse,
        {
          orderId: string;
          phone: string;
        }
      >("/payments/zalopay/query", {
        orderId,
        phone,
      });

      if (response.data.paymentStatus === "PAID") {
        setPaymentState("PAID");
        setPaidAt(response.data.paidAt ?? null);
        setMessage("Thanh toán ZaloPay đã được xác nhận thành công.");

        window.sessionStorage.removeItem(
          `aws-shop-zalopay-phone:${orderId}`
        );

        return;
      }

      setPaymentState("PENDING");
      setMessage(
        response.data.zalopayMessage ||
          "Thanh toán chưa được xác nhận. Bạn có thể chờ ít phút rồi kiểm tra lại."
      );
    } catch (error) {
      setPaymentState("ERROR");

      setMessage(
        error instanceof Error
          ? error.message
          : "Không thể kiểm tra trạng thái thanh toán."
      );
    }
  }, [orderId]);

  useEffect(() => {
  if (!isZaloPay || paymentSetupFailed) {
    return;
  }

  const timerId = window.setTimeout(() => {
    void checkZaloPayPayment();
  }, 0);

  return () => {
    window.clearTimeout(timerId);
  };
}, [checkZaloPayPayment, isZaloPay, paymentSetupFailed]);



  const isPaid = isZaloPay && paymentState === "PAID";

  const pageHeading = isPaid
    ? "Thanh toán thành công"
    : "Đơn hàng đã được ghi nhận";

  const pageDescription = isPaid
    ? "ZaloPay đã xác nhận giao dịch. Shop sẽ chuẩn bị đơn hàng trong thời gian sớm nhất."
    : isZaloPay
      ? "Đơn hàng của bạn đã được tạo. Trạng thái thanh toán sẽ được cập nhật sau khi ZaloPay xác nhận."
      : "Đơn hàng của bạn đã được ghi nhận. Shop sẽ liên hệ để xác nhận và giao hàng trong thời gian sớm nhất.";

  const displayMessage = paymentSetupFailed
    ? "Đơn hàng đã được tạo nhưng chưa thể khởi tạo phiên thanh toán ZaloPay. Hãy liên hệ shop và cung cấp mã đơn hàng."
    : message;

  const statusClassName =
    paymentState === "PAID"
      ? "bg-emerald-50 text-emerald-700"
      : paymentState === "ERROR" || paymentSetupFailed
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";

  const canRetryPayment =
    isZaloPay &&
    !paymentSetupFailed &&
    (paymentState === "PENDING" || paymentState === "ERROR");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p
          className={`text-sm font-semibold ${
            isPaid ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {isPaid
            ? "THANH TOÁN THÀNH CÔNG"
            : "ĐƠN HÀNG ĐÃ ĐƯỢC GHI NHẬN"}
        </p>

        <h1 className="mt-3 text-3xl font-bold text-slate-900">
          {pageHeading}
        </h1>

        <p className="mt-4 text-slate-600">{pageDescription}</p>

        {orderId ? (
          <div className="mt-6 rounded-xl bg-slate-50 px-5 py-4">
            <p className="text-sm text-slate-500">Mã đơn hàng</p>

            <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
              {orderId}
            </p>
          </div>
        ) : null}

        {isZaloPay && displayMessage ? (
          <div
            className={`mt-5 rounded-xl px-5 py-4 text-sm ${statusClassName}`}
          >
            {displayMessage}
          </div>
        ) : null}

        {paidAt ? (
          <p className="mt-4 text-sm text-slate-500">
            Thời gian thanh toán: {formatDate(paidAt)}
          </p>
        ) : null}

        {canRetryPayment ? (
          <button
            type="button"
            onClick={() => void checkZaloPayPayment()}
            className="mt-5 rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Kiểm tra lại thanh toán
          </button>
        ) : null}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={
              orderId
                ? `/track-order/?orderId=${encodeURIComponent(orderId)}`
                : "/track-order/"
            }
            className="inline-flex justify-center rounded-lg border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Tra cứu đơn hàng
          </Link>

          <Link
            href="/products/"
            className="inline-flex justify-center rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700"
          >
            Tiếp tục mua sắm
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6">
          <p className="text-sm text-slate-500">
            Đang tải thông tin đơn hàng...
          </p>
        </main>
      }
    >
      <CheckoutSuccessContent />
    </Suspense>
  );
}

