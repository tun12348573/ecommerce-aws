import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { Order } from "@/types/order";
import { AdminOrdersClient } from "@/components/admin/AdminOrdersClient";

type OrdersResponse = {
  data: Order[];
};

export default async function AdminOrdersPage() {
  const response = await apiGet<OrdersResponse>("/admin/orders");
  const orders = response.data;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/admin" className="text-2xl font-bold">
            AWS Shop Admin
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <Link href="/" className="text-gray-600 hover:text-black">
              Website
            </Link>

            <Link href="/admin" className="text-gray-600 hover:text-black">
              Dashboard
            </Link>

            <Link href="/admin/orders" className="text-black">
              Đơn hàng
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <p className="mb-3 text-sm font-bold uppercase text-blue-600">
            Admin
          </p>

          <h1 className="text-4xl font-extrabold">Quản lý đơn hàng</h1>
        </div>

        <AdminOrdersClient initialOrders={orders} />
      </section>
    </main>
  );
}