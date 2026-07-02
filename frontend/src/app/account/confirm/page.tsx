"use client";

import Link from "next/link";
import { type FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import {
  confirmCustomerSignUp,
  CustomerAuthError,
  resendCustomerConfirmationCode,
} from "@/lib/customer-auth";

function CustomerConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(
    () => searchParams.get("email")?.trim() ?? ""
  );
  const [code, setCode] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      await confirmCustomerSignUp(email, code);

      router.replace(
        `/account/login/?email=${encodeURIComponent(
          email.trim()
        )}&confirmed=1`
      );
    } catch (error) {
      setErrorMessage(
        error instanceof CustomerAuthError
          ? error.message
          : "Không thể xác minh email."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode() {
    setErrorMessage("");
    setSuccessMessage("");
    setIsResending(true);

    try {
      const destination = await resendCustomerConfirmationCode(email);

      setSuccessMessage(
        destination
          ? `Đã gửi lại mã xác minh đến ${destination}.`
          : "Đã gửi lại mã xác minh."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof CustomerAuthError
          ? error.message
          : "Không thể gửi lại mã xác minh."
      );
    } finally {
      setIsResending(false);
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
          Xác minh email
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Nhập mã xác minh Cognito vừa gửi đến email của bạn.
        </p>

        {errorMessage ? (
          <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
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
              Mã xác minh
            </span>

            <input
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 tracking-[0.25em] outline-none focus:border-slate-900"
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Đang xác minh..." : "Xác minh email"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleResendCode()}
          disabled={isResending}
          className="mt-5 w-full text-sm font-semibold text-slate-700 underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResending ? "Đang gửi lại..." : "Gửi lại mã xác minh"}
        </button>

        <p className="mt-6 text-center text-sm text-slate-600">
          Đã xác minh?{" "}
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

export default function CustomerConfirmPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-500">Đang tải...</p>
        </main>
      }
    >
      <CustomerConfirmContent />
    </Suspense>
  );
}