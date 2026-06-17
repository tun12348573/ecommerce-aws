import Link from "next/link";

const products = [
  {
    id: "p001",
    name: "Áo thun basic",
    category: "Thời trang",
    price: 199000,
    salePrice: 159000,
  },
  {
    id: "p002",
    name: "Quần jean nam",
    category: "Thời trang",
    price: 399000,
    salePrice: 349000,
  },
  {
    id: "p003",
    name: "Giày sneaker trắng",
    category: "Giày dép",
    price: 599000,
    salePrice: 499000,
  },
];

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-2xl font-bold">
            AWS Shop
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
            <Link href="/" className="text-black">
              Trang chủ
            </Link>

            <Link href="/products" className="text-gray-600 hover:text-black">
              Sản phẩm
            </Link>

            <Link href="/cart" className="text-gray-600 hover:text-black">
              Giỏ hàng
            </Link>

            <Link href="/login" className="text-gray-600 hover:text-black">
              Đăng nhập
            </Link>
          </nav>

          <Link
            href="/cart"
            className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white"
          >
            Giỏ hàng
          </Link>
        </div>
      </header>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-2 md:items-center">
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-widest text-blue-600">
              Ecommerce on AWS
            </p>

            <h1 className="mb-6 text-4xl font-extrabold tracking-tight md:text-6xl">
              Web bán hàng hiện đại xây dựng trên AWS
            </h1>

            <p className="mb-8 max-w-xl text-lg leading-8 text-gray-600">
              Dự án thương mại điện tử sử dụng Next.js, AWS Lambda, API Gateway,
              DynamoDB, Cognito, S3 và CloudFront.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/products"
                className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white"
              >
                Xem sản phẩm
              </Link>

              <Link
                href="/about"
                className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-bold"
              >
                Tìm hiểu thêm
              </Link>
            </div>
          </div>

          <div className="rounded-3xl bg-linear-to-br from-gray-100 to-gray-200 p-8">
            <div className="rounded-3xl bg-white p-6 shadow-xl">
              <div className="mb-6 h-64 rounded-2xl bg-gray-200" />

              <div className="space-y-3">
                <div className="h-4 w-2/3 rounded bg-gray-200" />
                <div className="h-4 w-1/2 rounded bg-gray-200" />
                <div className="h-10 w-full rounded-xl bg-black" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="mb-2 text-sm font-bold uppercase text-blue-600">
              Sản phẩm
            </p>

            <h2 className="text-3xl font-bold">Sản phẩm nổi bật</h2>
          </div>

          <Link href="/products" className="text-sm font-bold text-blue-600">
            Xem tất cả
          </Link>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex aspect-square items-center justify-center bg-gray-100">
                <span className="text-sm font-semibold text-gray-400">
                  Ảnh sản phẩm
                </span>
              </div>

              <div className="p-6">
                <p className="mb-2 text-sm font-semibold text-blue-600">
                  {product.category}
                </p>

                <h3 className="mb-3 text-xl font-bold">{product.name}</h3>

                <div className="mb-5 flex items-center gap-3">
                  <span className="text-xl font-extrabold text-red-600">
                    {formatPrice(product.salePrice)}
                  </span>

                  <span className="text-sm text-gray-400 line-through">
                    {formatPrice(product.price)}
                  </span>
                </div>

                <button className="w-full rounded-xl bg-black px-5 py-3 text-sm font-bold text-white">
                  Thêm vào giỏ hàng
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-6 py-12 md:grid-cols-3">
          <div className="rounded-2xl border p-6">
            <h3 className="mb-2 font-bold">Giao hàng nhanh</h3>
            <p className="text-sm text-gray-600">
              Hỗ trợ xử lý đơn hàng và trạng thái giao hàng.
            </p>
          </div>

          <div className="rounded-2xl border p-6">
            <h3 className="mb-2 font-bold">Thanh toán an toàn</h3>
            <p className="text-sm text-gray-600">
              Có thể tích hợp COD, chuyển khoản, MoMo hoặc VNPay.
            </p>
          </div>

          <div className="rounded-2xl border p-6">
            <h3 className="mb-2 font-bold">Chạy trên AWS</h3>
            <p className="text-sm text-gray-600">
              Sẵn sàng mở rộng với Lambda, DynamoDB, S3 và CloudFront.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t bg-black text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
          <p className="font-bold">AWS Shop</p>

          <p className="text-sm text-gray-400">
            Ecommerce project built with Next.js and AWS.
          </p>
        </div>
      </footer>
    </main>
  );
}