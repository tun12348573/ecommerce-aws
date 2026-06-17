import Link from "next/link";

type CheckoutSuccessPageProps = {
  searchParams: Promise<{
    orderId?: string;
  }>;
};

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const { orderId } = await searchParams;

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

            <Link href="/products" className="text-gray-600 hover:text-black">
              Sản phẩm
            </Link>

            <Link href="/cart" className="text-gray-600 hover:text-black">
              Giỏ hàng
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-20">
        <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✓
          </div>

          <p className="mb-3 text-sm font-bold uppercase text-blue-600">
            Đặt hàng thành công
          </p>

          <h1 className="mb-4 text-4xl font-extrabold">
            Cảm ơn bạn đã mua hàng
          </h1>

          <p className="mb-6 text-gray-600">
            Đơn hàng của bạn đã được tạo thành công. Shop sẽ sớm liên hệ để xác
            nhận và giao hàng.
          </p>

          {orderId ? (
            <div className="mb-8 rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-600">Mã đơn hàng</p>
              <p className="text-xl font-extrabold">{orderId}</p>
            </div>
          ) : null}

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/products"
              className="rounded-xl bg-black px-6 py-3 text-sm font-bold text-white"
            >
              Tiếp tục mua sắm
            </Link>

            <Link
              href="/"
              className="rounded-xl border border-gray-300 px-6 py-3 text-sm font-bold"
            >
              Về trang chủ
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}