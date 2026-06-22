"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminGuard } from "@/components/admin/AdminGuard";
import {
  getAdminUsername,
  signOutAdmin,
} from "@/lib/admin-auth";
import { adminGet } from "@/lib/admin-api";
import type { Order } from "@/types/order";

type OrdersResponse = {
  data: Order[];
};

function AdminDashboardContent() {
  const router = useRouter();

  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const adminUsername = getAdminUsername();

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const response = await adminGet<OrdersResponse>("/admin/orders");

        if (isMounted) {
          setOrderCount(response.data.length);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Không thể kết nối Admin API."
          );
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleSignOut() {
    signOutAdmin();
    router.replace("/admin/login");
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            ECOMMERCE AWS ADMIN
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Trang quản trị
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Đăng nhập với tài khoản: {adminUsername || "admin"}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Đăng xuất
        </button>
      </header>

      <section className="mt-8 grid gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Kết nối Admin API
          </p>

          <p className="mt-3 text-2xl font-bold text-emerald-600">
            {errorMessage ? "Không thành công" : "Đã xác thực"}
          </p>

          <p className="mt-2 text-sm text-slate-600">
            JWT Cognito đang được gửi đến API Gateway.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Tổng đơn hàng
          </p>

          <p className="mt-3 text-3xl font-bold text-slate-900">
            {orderCount === null ? "..." : orderCount}
          </p>

          <p className="mt-2 text-sm text-slate-600">
            Dữ liệu lấy trực tiếp từ API AWS.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Trạng thái bảo mật
          </p>

          <p className="mt-3 text-2xl font-bold text-slate-900">
            Cognito JWT
          </p>

          <p className="mt-2 text-sm text-slate-600">
            Route admin không còn dùng Admin API Key.
          </p>
        </article>
      </section>

      {errorMessage ? (
        <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <section className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/orders"
          className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Quản lý đơn hàng
        </Link>

        <Link
          href="/admin/products"
          className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Quản lý sản phẩm
        </Link>
      </section>
    </main>
  );
}

export default function AdminDashboardPage() {
  return (
    <AdminGuard>
      <AdminDashboardContent />
    </AdminGuard>
  );
}
