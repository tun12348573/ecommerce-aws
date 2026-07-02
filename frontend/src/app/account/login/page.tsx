"use client";

import Link from "next/link";
import { type FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  CustomerAuthError,
  signInCustomer,
} from "@/lib/customer-auth";

function CustomerLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(
    () => searchParams.get("email")?.trim() ?? ""
  );
  const [password, setPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isConfirmed = searchParams.get("confirmed") === "1";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await signInCustomer(email, password);

      router.replace("/products/");
    } catch (error) {
      setErrorMessage(
        error instanceof CustomerAuthError
          ? error.message
          : "Không thể đăng nhập."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <Link
          href="/products/"
          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
        >
          ← Quay lại cửa hàng
        </Link>

        <p className="mt-7 text-sm font-semibold text-slate-500">
          AWS SHOP
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Đăng nhập
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Đăng nhập để quản lý lịch sử đơn hàng cá nhân.
        </p>

        {isConfirmed ? (
          <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Email đã được xác minh. Bạn có thể đăng nhập ngay.
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Email
            </span>

            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              autoComplete="email"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Mật khẩu
            </span>

            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Chưa có tài khoản?{" "}
          <Link
            href="/account/register/"
            className="font-semibold text-slate-900 underline"
          >
            Đăng ký
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-500">Đang tải...</p>
        </main>
      }
    >
      <CustomerLoginContent />
    </Suspense>
  );
}