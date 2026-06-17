"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CartItem } from "@/types/cart";
import {
  getCartItems,
  removeCartItem,
  updateCartItemQuantity,
  clearCart,
} from "@/lib/cart";

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export default function CartPage() {
  const [items, setItems] = useState<CartItem[]>(() => getCartItems());

  const subtotal = useMemo(() => {
    return items.reduce((total, item) => {
      return total + item.salePrice * item.quantity;
    }, 0);
  }, [items]);

  function handleUpdateQuantity(productId: string, quantity: number) {
    const nextCart = updateCartItemQuantity(productId, quantity);
    setItems(nextCart);
  }

  function handleRemoveItem(productId: string) {
    const nextCart = removeCartItem(productId);
    setItems(nextCart);
  }

  function handleClearCart() {
    clearCart();
    setItems([]);
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

            <Link href="/products" className="text-gray-600 hover:text-black">
              Sản phẩm
            </Link>

            <Link href="/cart" className="text-black">
              Giỏ hàng
            </Link>

            <Link href="/login" className="text-gray-600 hover:text-black">
              Đăng nhập
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <p className="mb-3 text-sm font-bold uppercase text-blue-600">
            Giỏ hàng
          </p>

          <h1 className="text-4xl font-extrabold">Sản phẩm trong giỏ hàng</h1>
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
            <h2 className="mb-3 text-2xl font-bold">Giỏ hàng đang trống</h2>

            <p className="mb-6 text-gray-600">
              Bạn chưa thêm sản phẩm nào vào giỏ hàng.
            </p>

            <Link
              href="/products"
              className="inline-block rounded-xl bg-black px-6 py-3 text-sm font-bold text-white"
            >
              Tiếp tục mua sắm
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.productId}
                  className="grid gap-4 rounded-3xl bg-white p-5 shadow-sm md:grid-cols-[120px_1fr_auto]"
                >
                  <Link href={`/products/${item.slug}`}>
                    <div className="flex aspect-square items-center justify-center rounded-2xl bg-gray-100">
                      <span className="text-xs font-semibold text-gray-400">
                        Ảnh
                      </span>
                    </div>
                  </Link>

                  <div>
                    <p className="mb-1 text-sm font-semibold text-blue-600">
                      {item.category}
                    </p>

                    <Link href={`/products/${item.slug}`}>
                      <h2 className="mb-2 text-xl font-bold hover:text-blue-600">
                        {item.name}
                      </h2>
                    </Link>

                    <div className="mb-4 flex items-center gap-3">
                      <span className="font-bold text-red-600">
                        {formatPrice(item.salePrice)}
                      </span>

                      <span className="text-sm text-gray-400 line-through">
                        {formatPrice(item.price)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.productId)}
                      className="text-sm font-bold text-red-600"
                    >
                      Xóa sản phẩm
                    </button>
                  </div>

                  <div className="flex items-center gap-3 md:justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateQuantity(item.productId, item.quantity - 1)
                      }
                      className="h-10 w-10 rounded-full border font-bold"
                    >
                      -
                    </button>

                    <input
                      type="number"
                      min={1}
                      max={item.stock}
                      value={item.quantity}
                      onChange={(event) =>
                        handleUpdateQuantity(
                          item.productId,
                          Number(event.target.value)
                        )
                      }
                      className="h-10 w-16 rounded-xl border text-center"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateQuantity(item.productId, item.quantity + 1)
                      }
                      className="h-10 w-10 rounded-full border font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <aside className="h-fit rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-2xl font-bold">Tóm tắt đơn hàng</h2>

              <div className="mb-4 flex justify-between text-sm">
                <span>Tạm tính</span>
                <span className="font-bold">{formatPrice(subtotal)}</span>
              </div>

              <div className="mb-4 flex justify-between text-sm">
                <span>Phí vận chuyển</span>
                <span className="font-bold">Tính ở bước sau</span>
              </div>

              <div className="my-5 border-t" />

              <div className="mb-6 flex justify-between text-lg font-extrabold">
                <span>Tổng cộng</span>
                <span className="text-red-600">{formatPrice(subtotal)}</span>
              </div>

              <Link
                href="/checkout"
                className="mb-3 block w-full rounded-xl bg-black px-5 py-3 text-center text-sm font-bold text-white"
              >
                Tiến hành thanh toán
              </Link>

              <button
                type="button"
                onClick={handleClearCart}
                className="w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-bold"
              >
                Xóa toàn bộ giỏ hàng
              </button>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}