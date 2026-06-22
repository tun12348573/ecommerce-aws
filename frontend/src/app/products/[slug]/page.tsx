import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";
import type { Product } from "@/types/product";

type ProductsResponse = {
data: Product[];
};

export async function generateStaticParams() {
const response = await apiGet<ProductsResponse>("/products");

return response.data.map((product) => ({
slug: product.slug,
}));
}


type ProductResponse = {
  data: Product;
};

type ProductDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;

  let product: Product;

  try {
    const response = await apiGet<ProductResponse>(`/products/${slug}`);
    product = response.data;
  } catch {
    notFound();
  }

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

            <Link href="/login" className="text-gray-600 hover:text-black">
              Đăng nhập
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex aspect-square items-center justify-center rounded-2xl bg-gray-100">
            <span className="text-sm font-semibold text-gray-400">
              Ảnh sản phẩm
            </span>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <Link
            href="/products"
            className="mb-6 inline-block text-sm font-bold text-blue-600"
          >
            ← Quay lại sản phẩm
          </Link>

          <p className="mb-3 text-sm font-bold uppercase text-blue-600">
            {product.category}
          </p>

          <h1 className="mb-4 text-4xl font-extrabold">
            {product.name}
          </h1>

          <p className="mb-6 leading-7 text-gray-600">
            {product.description}
          </p>

          <div className="mb-6 flex items-center gap-4">
            <span className="text-3xl font-extrabold text-red-600">
              {formatPrice(product.salePrice)}
            </span>

            <span className="text-lg text-gray-400 line-through">
              {formatPrice(product.price)}
            </span>
          </div>

          <div className="mb-8 rounded-2xl bg-gray-50 p-5">
            <p className="mb-2 text-sm text-gray-600">
              Tình trạng kho:
            </p>

            <p className="font-bold">
              Còn {product.stock} sản phẩm
            </p>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-sm font-bold">
              Số lượng
            </label>

            <input
              type="number"
              defaultValue={1}
              min={1}
              max={product.stock}
              className="w-28 rounded-xl border px-4 py-3"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button className="rounded-xl bg-black px-6 py-4 text-sm font-bold text-white">
              Thêm vào giỏ hàng
            </button>

            <button className="rounded-xl border border-gray-300 px-6 py-4 text-sm font-bold">
              Mua ngay
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}