"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminAuthError } from "@/lib/admin-auth";
import { adminGet } from "@/lib/admin-api";

type DashboardSummary = {
  totalOrders: number;
  paidRevenue: number;
  paidOrders: number;
  pendingPaymentOrders: number;
  processingOrders: number;
  shippingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
};

type DailyRevenueItem = {
  date: string;
  revenue: number;
  paidOrders: number;
};

type AdminDashboardData = {
  summary: DashboardSummary;
  dailyRevenue: DailyRevenueItem[];
};

type DashboardResponse = {
  data: AdminDashboardData;
};

type DashboardDays = 7 | 14 | 30;

function formatMoney(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateLabel(value: string): string {
  return new Date(`${value}T12:00:00+07:00`).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

function AdminDashboardContent() {
  const router = useRouter();

  const [days, setDays] = useState<DashboardDays>(14);
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof AdminAuthError) {
        router.replace("/admin/login");
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Không thể tải dữ liệu dashboard."
      );
    },
    [router]
  );

  const fetchDashboard = useCallback(async (selectedDays: DashboardDays) => {
    return adminGet<DashboardResponse>(
      `/admin/dashboard?days=${selectedDays}`
    );
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const response = await fetchDashboard(days);

        if (!isMounted) {
          return;
        }

        setDashboard(response.data);
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

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [days, fetchDashboard, handleError]);

  async function handleRefresh() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetchDashboard(days);
      setDashboard(response.data);
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleChangeDays(value: DashboardDays) {
    setIsLoading(true);
    setDays(value);
  }

  const summary = dashboard?.summary;
  const dailyRevenue = dashboard?.dailyRevenue ?? [];

  const highestRevenue = dailyRevenue.reduce(
    (highest, item) => Math.max(highest, item.revenue),
    0
  );

  const chartMaxRevenue = Math.max(highestRevenue, 1);

  const totalRevenueInPeriod = dailyRevenue.reduce(
    (total, item) => total + item.revenue,
    0
  );

  const totalPaidOrdersInPeriod = dailyRevenue.reduce(
    (total, item) => total + item.paidOrders,
    0
  );

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            ECOMMERCE AWS ADMIN
          </p>

          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            Dashboard doanh thu
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Theo dõi đơn hàng, doanh thu và trạng thái thanh toán.
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
            href="/admin/products"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Sản phẩm
          </Link>

          <Link
            href="/admin/refunds/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Hoàn tiền
          </Link>

          <Link
            href="/admin/orders/"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Đơn hàng
          </Link>
        </div>
      </header>

      {errorMessage ? (
        <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <section className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Doanh thu đã thanh toán
          </p>

          <p className="mt-3 text-2xl font-bold text-emerald-600">
            {isLoading || !summary ? "..." : formatMoney(summary.paidRevenue)}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Chỉ tính đơn đã thanh toán.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Tổng đơn hàng
          </p>

          <p className="mt-3 text-3xl font-bold text-slate-900">
            {isLoading || !summary ? "..." : summary.totalOrders}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Bao gồm cả đơn đã hủy.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Đơn đã thanh toán
          </p>

          <p className="mt-3 text-3xl font-bold text-slate-900">
            {isLoading || !summary ? "..." : summary.paidOrders}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            COD, chuyển khoản và ZaloPay.
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Chờ thanh toán
          </p>

          <p className="mt-3 text-3xl font-bold text-amber-600">
            {isLoading || !summary ? "..." : summary.pendingPaymentOrders}
          </p>

          <p className="mt-2 text-sm text-slate-500">
            Không tính đơn đã hủy.
          </p>
        </article>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Đang xử lý</p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {isLoading || !summary ? "..." : summary.processingOrders}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Đang giao</p>

          <p className="mt-2 text-2xl font-bold text-blue-600">
            {isLoading || !summary ? "..." : summary.shippingOrders}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Hoàn thành</p>

          <p className="mt-2 text-2xl font-bold text-emerald-600">
            {isLoading || !summary ? "..." : summary.completedOrders}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Đã hủy</p>

          <p className="mt-2 text-2xl font-bold text-red-600">
            {isLoading || !summary ? "..." : summary.cancelledOrders}
          </p>
        </article>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Doanh thu theo ngày
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Chỉ hiển thị doanh thu từ đơn đã thanh toán.
            </p>
          </div>

          <div className="flex rounded-lg border border-slate-200 p-1">
            {([7, 14, 30] as DashboardDays[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => handleChangeDays(value)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  days === value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {value} ngày
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-500">
            Đang tải biểu đồ...
          </div>
        ) : (
          <div className="mt-8">
            <div className="flex h-64 items-end gap-2 border-b border-slate-200 pb-2">
              {dailyRevenue.map((item) => {
                const height =
                  item.revenue > 0
                    ? Math.max(
                        6,
                        (item.revenue / chartMaxRevenue) * 100
                      )
                    : 0;

                return (
                  <div
                    key={item.date}
                    className="flex h-full flex-1 flex-col justify-end"
                    title={`${formatDateLabel(item.date)}: ${formatMoney(
                      item.revenue
                    )}`}
                  >
                    <div
                      className="rounded-t-md bg-emerald-500 transition-all"
                      style={{ height: `${height}%` }}
                    />

                    <p className="mt-2 text-center text-xs text-slate-500">
                      {formatDateLabel(item.date)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Doanh thu cao nhất/ngày
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {formatMoney(highestRevenue)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Tổng doanh thu trong kỳ
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {formatMoney(totalRevenueInPeriod)}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Số đơn đã thanh toán trong kỳ
                </p>

                <p className="mt-1 font-bold text-slate-900">
                  {totalPaidOrdersInPeriod}
                </p>
              </div>
            </div>
          </div>
        )}
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