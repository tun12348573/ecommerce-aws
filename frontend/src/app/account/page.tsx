"use client";

import Link from "next/link";

export default function CustomerAccountPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-500">AWS SHOP</p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Tài khoản khách hàng
        </h1>

        <p className="mt-4 text-sm leading-6 text-slate-600">
          Đăng nhập để theo dõi lịch sử đơn hàng của bạn, hoặc tạo tài khoản
          mới để mua sắm thuận tiện hơn.
        </p>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/account/login/"
            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Đăng nhập
          </Link>

          <Link
            href="/account/register/"
            className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
          >
            Tạo tài khoản
          </Link>
        </div>
      </section>
    </main>
  );
}
