import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-2xl font-bold">
            AWS Shop Admin
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <Link href="/" className="text-gray-600 hover:text-black">
              Website
            </Link>

            <Link href="/admin" className="text-black">
              Dashboard
            </Link>

            <Link href="/admin/orders" className="text-gray-600 hover:text-black">
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

          <h1 className="text-4xl font-extrabold">Dashboard quản trị</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Link
            href="/admin/orders"
            className="rounded-3xl bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
          >
            <h2 className="mb-2 text-xl font-bold">Quản lý đơn hàng</h2>
            <p className="text-sm text-gray-600">
              Xem đơn hàng và cập nhật trạng thái xử lý.
            </p>
          </Link>

          <div className="rounded-3xl bg-white p-6 shadow-sm opacity-60">
            <h2 className="mb-2 text-xl font-bold">Quản lý sản phẩm</h2>
            <p className="text-sm text-gray-600">
              Sẽ làm ở bước tiếp theo.
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm opacity-60">
            <h2 className="mb-2 text-xl font-bold">Doanh thu</h2>
            <p className="text-sm text-gray-600">
              Sẽ làm sau khi có database thật.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}