import Link from "next/link";
import { ProductCard } from "@/components/products/ProductCard";
import { apiGet } from "@/lib/api";
import type { Product } from "@/types/product";

type ProductsResponse = {
  data: Product[];
};

export default async function ProductsPage() {
  const response = await apiGet<ProductsResponse>("/products");
  const products = response.data;

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-2xl font-bold">
            AWS Shop
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <Link href="/" className="text-gray-600 hover:text-black">
              Trang chủ
            </Link>

            <Link href="/products" className="text-black">
              Sản phẩm
            </Link>

            <Link href="/cart" className="text-gray-600 hover:text-black">
              Giỏ hàng
            </Link>

            <Link href="/track-order" className="text-gray-600 hover:text-black">
              Tra cứu đơn
            </Link>
          </nav>
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
            Sản phẩm được lấy từ hệ thống AWS. Tồn kho sẽ được cập nhật trực
            tiếp từ API.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {products.length} sản phẩm
          </h2>

          <select className="rounded-xl border bg-white px-4 py-2 text-sm">
            <option>Sắp xếp mặc định</option>
            <option>Giá thấp đến cao</option>
            <option>Giá cao đến thấp</option>
          </select>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
  <ProductCard key={product.productId} product={product} />
))}
        </div>
      </section>
    </main>
  );
}

