import Link from "next/link";

import { CustomerAccountMenu } from "@/components/customer/CustomerAccountMenu";
import { ProductCatalogClient } from "@/components/products/ProductCatalogClient";

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-2xl font-bold">
            AWS Shop
          </Link>

          <div className="flex items-center gap-4">
            <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
              <Link href="/" className="text-gray-600 hover:text-black">
                Trang chủ
              </Link>

              <Link href="/products/" className="text-black">
                Sản phẩm
              </Link>

              <Link
                href="/track-order/"
                className="text-gray-600 hover:text-black"
              >
                Tra cứu đơn
              </Link>
            </nav>

            <CustomerAccountMenu />

            <Link
              href="/cart/"
              className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Giỏ hàng
            </Link>
          </div>
        </div>
      </header>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <p className="mb-3 text-sm font-bold uppercase text-blue-600">
            Tất cả sản phẩm
          </p>

          <h1 className="mb-4 text-4xl font-extrabold">
            Khám phá sản phẩm mới nhất
          </h1>

          <p className="max-w-2xl text-gray-600">
            Tìm kiếm, lọc danh mục và sắp xếp sản phẩm phù hợp với nhu cầu của
            bạn.
          </p>
        </div>
      </section>

      <ProductCatalogClient />
    </main>
  );
}
