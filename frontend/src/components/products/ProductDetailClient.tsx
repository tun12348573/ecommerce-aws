"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { CustomerAccountMenu } from "@/components/customer/CustomerAccountMenu";
import LiveProductStock from "@/components/products/LiveProductStock";
import { apiGetLive } from "@/lib/api";
import { addToCart } from "@/lib/cart";
import type { Product } from "@/types/product";

type ProductResponse = {
  data: Product;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export function ProductDetailClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug")?.trim() ?? "";

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadProduct() {
      if (!slug) {
        if (isActive) {
          setProduct(null);
          setLoadError("Liên kết sản phẩm không hợp lệ.");
          setIsLoading(false);
        }

        return;
      }

      try {
        setIsLoading(true);
        setLoadError(null);

        const response = await apiGetLive<ProductResponse>(
          `/products/${encodeURIComponent(slug)}`
        );

        if (isActive) {
          setProduct(response.data);
          setQuantity(1);
        }
      } catch (error) {
        if (isActive) {
          setProduct(null);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Không tìm thấy sản phẩm hoặc sản phẩm đã bị xóa."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProduct();

    return () => {
      isActive = false;
    };
  }, [slug]);

  function handleQuantityChange(value: string) {
    if (!product) {
      return;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      setQuantity(1);
      return;
    }

    const safeMaximum = Math.max(product.stock, 1);

    setQuantity(
      Math.min(Math.max(Math.floor(parsed), 1), safeMaximum)
    );
  }

  function handleBuyNow() {
    if (!product || product.stock <= 0) {
      return;
    }

    addToCart(product, quantity);
    router.push("/cart/");
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 text-gray-900">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid animate-pulse gap-10 lg:grid-cols-2">
            <div className="aspect-square rounded-3xl bg-slate-200" />

            <div className="space-y-5 rounded-3xl bg-white p-8 shadow-sm">
              <div className="h-4 w-1/4 rounded bg-slate-200" />
              <div className="h-10 w-3/4 rounded bg-slate-200" />
              <div className="h-20 w-full rounded bg-slate-200" />
              <div className="h-10 w-1/3 rounded bg-slate-200" />
              <div className="h-14 w-full rounded-xl bg-slate-200" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-gray-50 px-6 py-20 text-gray-900">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-extrabold">
            Không tìm thấy sản phẩm
          </h1>

          <p className="mt-3 text-sm text-gray-600">
            {loadError ?? "Sản phẩm không còn tồn tại hoặc liên kết đã hết hạn."}
          </p>

          <Link
            href="/products/"
            className="mt-6 inline-block rounded-xl bg-black px-5 py-3 text-sm font-bold text-white"
          >
            Quay lại danh sách sản phẩm
          </Link>
        </section>
      </main>
    );
  }

  const imageUrl = product.image?.trim();
  const maximumQuantity = Math.max(product.stock, 1);

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

      <section className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-semibold text-gray-400">
                Chưa có ảnh sản phẩm
              </span>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <Link
            href="/products/"
            className="mb-6 inline-block text-sm font-bold text-blue-600"
          >
            ← Quay lại sản phẩm
          </Link>

          <p className="mb-3 text-sm font-bold uppercase text-blue-600">
            {product.category}
          </p>

          <h1 className="mb-4 text-4xl font-extrabold">{product.name}</h1>

          <p className="mb-6 leading-7 text-gray-600">
            {product.description}
          </p>

          <div className="mb-6 flex items-center gap-4">
            <span className="text-3xl font-extrabold text-red-600">
              {formatPrice(product.salePrice)}
            </span>

            {product.price > product.salePrice ? (
              <span className="text-lg text-gray-400 line-through">
                {formatPrice(product.price)}
              </span>
            ) : null}
          </div>

          <div className="mb-8 rounded-2xl bg-gray-50 p-5">
            <p className="mb-2 text-sm text-gray-600">Tình trạng kho:</p>

            <LiveProductStock productId={product.productId} />
          </div>

          <div className="mb-6">
            <label
              htmlFor="product-quantity"
              className="mb-2 block text-sm font-bold"
            >
              Số lượng
            </label>

            <input
              id="product-quantity"
              type="number"
              value={quantity}
              min={1}
              max={maximumQuantity}
              disabled={product.stock <= 0}
              onChange={(event) => handleQuantityChange(event.target.value)}
              className="w-28 rounded-xl border px-4 py-3 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <AddToCartButton
              product={product}
              quantity={quantity}
              className="rounded-xl bg-black px-6 py-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
            />

            <button
              type="button"
              onClick={handleBuyNow}
              disabled={product.stock <= 0}
              className="rounded-xl border border-gray-300 px-6 py-4 text-sm font-bold disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              Mua ngay
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
