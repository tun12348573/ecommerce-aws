"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CustomerAuthError,
  signUpCustomer,
} from "@/lib/customer-auth";

export default function CustomerRegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setErrorMessage("Mật khẩu xác nhận chưa trùng khớp.");
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const result = await signUpCustomer(email, password);

      if (result.userConfirmed) {
        router.replace("/account/login/");
        return;
      }

      router.replace(
        `/account/confirm/?email=${encodeURIComponent(email.trim())}`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof CustomerAuthError
          ? error.message
          : "Không thể đăng ký tài khoản."
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
          Tạo tài khoản
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Đăng ký để theo dõi lịch sử và trạng thái đơn hàng của bạn.
        </p>

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
              placeholder="you@example.com"
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
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              placeholder="Ít nhất 8 ký tự"
              autoComplete="new-password"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Xác nhận mật khẩu
            </span>

            <input
              required
              type="password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang tạo tài khoản..." : "Đăng ký"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Đã có tài khoản?{" "}
          <Link
            href="/account/login/"
            className="font-semibold text-slate-900 underline"
          >
            Đăng nhập
          </Link>
        </p>
      </section>
    </main>
  );
}