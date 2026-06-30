"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiPost } from "@/lib/api";
import { clearCart } from "@/lib/cart";
import { useCartItems } from "@/hooks/useCartItems";
import type {
  CheckoutCustomer,
  CreateOrderRequest,
  OrderResponse,
  PaymentMethod,
} from "@/types/order";

type ZaloPayCreatePaymentResponse = {
  data: {
    orderId: string;
    amount: number;
    orderUrl: string;
    expiresAt: string;
  };
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export default function CheckoutPage() {
  const router = useRouter();
  const items = useCartItems();

  const [customer, setCustomer] = useState<CheckoutCustomer>({
    fullName: "",
    phone: "",
    email: "",
    address: "",
    note: "",
  });

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subtotal = useMemo(() => {
    return items.reduce((total, item) => {
      return total + item.salePrice * item.quantity;
    }, 0);
  }, [items]);

  const shippingFee = items.length > 0 ? 30000 : 0;
  const total = subtotal + shippingFee;

  function updateCustomerField(
    field: keyof CheckoutCustomer,
    value: string
  ) {
    setCustomer((currentCustomer) => ({
      ...currentCustomer,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (items.length === 0) {
      setError("Giỏ hàng đang trống.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    let createdOrderId: string | null = null;

    try {
      const payload: CreateOrderRequest = {
        items,
        customer,
        paymentMethod,
      };

      const orderResponse = await apiPost<OrderResponse, CreateOrderRequest>(
        "/orders",
        payload
      );

      createdOrderId = orderResponse.data.orderId;

      window.sessionStorage.setItem(
        `aws-shop-zalopay-phone:${createdOrderId}`,
        customer.phone.trim()
      );

      clearCart();

      if (paymentMethod === "ZALOPAY") {
        const paymentResponse = await apiPost<
          ZaloPayCreatePaymentResponse,
          {
            orderId: string;
            phone: string;
          }
        >("/payments/zalopay/create", {
          orderId: createdOrderId,
          phone: customer.phone.trim(),
        });

        window.location.assign(paymentResponse.data.orderUrl);
        return;
      }

      router.replace(
        `/checkout/success/?orderId=${encodeURIComponent(
          createdOrderId
        )}&paymentMethod=${paymentMethod}`
      );
    } catch (error) {
      if (createdOrderId) {
        router.replace(
          `/checkout/success/?orderId=${encodeURIComponent(
            createdOrderId
          )}&paymentMethod=${paymentMethod}&paymentSetup=failed`
        );

        return;
      }

      setError(
        error instanceof Error
          ? error.message
          : "Không thể tạo đơn hàng. Vui lòng thử lại."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const submitLabel = isSubmitting
    ? paymentMethod === "ZALOPAY"
      ? "Đang chuyển sang ZaloPay..."
      : "Đang tạo đơn hàng..."
    : paymentMethod === "ZALOPAY"
      ? "Thanh toán với ZaloPay"
      : "Đặt hàng";

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-2xl font-bold">
            AWS Shop
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <Link href="/" className="text-gray-600 hover:text-black">
              Trang chủ
            </Link>

            <Link href="/products/" className="text-gray-600 hover:text-black">
              Sản phẩm
            </Link>

            <Link href="/cart/" className="text-gray-600 hover:text-black">
              Giỏ hàng
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <p className="mb-3 text-sm font-bold uppercase text-blue-600">
            Thanh toán
          </p>

          <h1 className="text-4xl font-extrabold">Hoàn tất đơn hàng</h1>
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <h2 className="mb-3 text-2xl font-bold">Giỏ hàng đang trống</h2>

            <p className="mb-6 text-gray-600">
              Bạn cần thêm sản phẩm trước khi thanh toán.
            </p>

            <Link
              href="/products/"
              className="inline-block rounded-xl bg-black px-6 py-3 text-sm font-bold text-white"
            >
              Tiếp tục mua sắm
            </Link>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="grid gap-8 lg:grid-cols-[1fr_380px]"
          >
            <div className="space-y-6">
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="mb-5 text-2xl font-bold">
                  Thông tin giao hàng
                </h2>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      Họ và tên
                    </label>

                    <input
                      required
                      value={customer.fullName}
                      onChange={(event) =>
                        updateCustomerField("fullName", event.target.value)
                      }
                      className="w-full rounded-xl border px-4 py-3"
                      placeholder="Nguyễn Văn A"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold">
                      Số điện thoại
                    </label>

                    <input
                      required
                      value={customer.phone}
                      onChange={(event) =>
                        updateCustomerField("phone", event.target.value)
                      }
                      className="w-full rounded-xl border px-4 py-3"
                      placeholder="0900000000"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-bold">
                      Email
                    </label>

                    <input
                      required
                      type="email"
                      value={customer.email}
                      onChange={(event) =>
                        updateCustomerField("email", event.target.value)
                      }
                      className="w-full rounded-xl border px-4 py-3"
                      placeholder="you@example.com"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-bold">
                      Địa chỉ giao hàng
                    </label>

                    <textarea
                      required
                      value={customer.address}
                      onChange={(event) =>
                        updateCustomerField("address", event.target.value)
                      }
                      className="min-h-28 w-full rounded-xl border px-4 py-3"
                      placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-bold">
                      Ghi chú
                    </label>

                    <textarea
                      value={customer.note}
                      onChange={(event) =>
                        updateCustomerField("note", event.target.value)
                      }
                      className="min-h-24 w-full rounded-xl border px-4 py-3"
                      placeholder="Ví dụ: giao giờ hành chính..."
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="mb-5 text-2xl font-bold">
                  Phương thức thanh toán
                </h2>

                <div className="space-y-3">
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      checked={paymentMethod === "COD"}
                      onChange={() => setPaymentMethod("COD")}
                    />

                    <div>
                      <p className="font-bold">Thanh toán khi nhận hàng</p>

                      <p className="text-sm text-gray-600">
                        Khách trả tiền sau khi nhận sản phẩm.
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="BANK_TRANSFER"
                      checked={paymentMethod === "BANK_TRANSFER"}
                      onChange={() => setPaymentMethod("BANK_TRANSFER")}
                    />

                    <div>
                      <p className="font-bold">Chuyển khoản ngân hàng</p>

                      <p className="text-sm text-gray-600">
                        Shop sẽ xác nhận thanh toán sau khi kiểm tra giao dịch.
                      </p>
                    </div>
                  </label>

                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="ZALOPAY"
                      checked={paymentMethod === "ZALOPAY"}
                      onChange={() => setPaymentMethod("ZALOPAY")}
                    />

                    <div>
                      <p className="font-bold text-blue-950">
                        Thanh toán qua ZaloPay
                      </p>

                      <p className="text-sm text-blue-800">
                        Bạn sẽ được chuyển sang cổng thanh toán ZaloPay Sandbox.
                      </p>
                    </div>
                  </label>
                </div>
              </section>
            </div>

            <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-2xl font-bold">Đơn hàng của bạn</h2>

              <div className="mb-5 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex justify-between gap-4 text-sm"
                  >
                    <div>
                      <p className="font-bold">{item.name}</p>

                      <p className="text-gray-600">
                        SL: {item.quantity} × {formatPrice(item.salePrice)}
                      </p>
                    </div>

                    <p className="font-bold">
                      {formatPrice(item.salePrice * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t pt-5">
                <div className="mb-3 flex justify-between text-sm">
                  <span>Tạm tính</span>
                  <span className="font-bold">{formatPrice(subtotal)}</span>
                </div>

                <div className="mb-3 flex justify-between text-sm">
                  <span>Phí vận chuyển</span>
                  <span className="font-bold">{formatPrice(shippingFee)}</span>
                </div>

                <div className="my-5 border-t" />

                <div className="mb-6 flex justify-between text-lg font-extrabold">
                  <span>Tổng cộng</span>
                  <span className="text-red-600">{formatPrice(total)}</span>
                </div>

                {paymentMethod === "ZALOPAY" ? (
                  <p className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                    Sau khi tạo đơn, bạn sẽ được chuyển sang ZaloPay để thanh
                    toán.
                  </p>
                ) : null}

                {error ? (
                  <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-xl bg-black px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {submitLabel}
                </button>

                <Link
                  href="/cart/"
                  className="mt-3 block text-center text-sm font-bold text-blue-600"
                >
                  Quay lại giỏ hàng
                </Link>
              </div>
            </aside>
          </form>
        )}
      </section>
    </main>
  );
}

