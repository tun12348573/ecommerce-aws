"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CheckoutSuccessContent() {
const searchParams = useSearchParams();
const orderId = searchParams.get("orderId");

return ( <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12"> <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"> <p className="text-sm font-semibold text-emerald-600">
ĐẶT HÀNG THÀNH CÔNG </p>

    <h1 className="mt-3 text-3xl font-bold text-slate-900">
      Cảm ơn bạn đã đặt hàng
    </h1>

    <p className="mt-4 text-slate-600">
      Đơn hàng của bạn đã được ghi nhận. Chúng tôi sẽ liên hệ để xác nhận
      và giao hàng trong thời gian sớm nhất.
    </p>

    {orderId ? (
      <div className="mt-6 rounded-xl bg-slate-50 px-5 py-4">
        <p className="text-sm text-slate-500">Mã đơn hàng</p>

        <p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">
          {orderId}
        </p>
      </div>
    ) : null}

    <Link
      href="/products"
      className="mt-8 inline-flex rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-700"
    >
      Tiếp tục mua sắm
    </Link>
  </section>
</main>


);
}

export default function CheckoutSuccessPage() {
return (
<Suspense
fallback={ <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-6"> <p className="text-sm text-slate-500">Đang tải thông tin đơn hàng...</p> </main>
}
> <CheckoutSuccessContent /> </Suspense>
);
}
