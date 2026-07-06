"use client";

import { useEffect, useState } from "react";

import { ProductCard } from "@/components/products/ProductCard";
import { apiGetLive } from "@/lib/api";
import type { Product } from "@/types/product";

type ProductsResponse = {
  data: Product[];
};

export function FeaturedProductsSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadFeaturedProducts() {
      try {
        const response = await apiGetLive<ProductsResponse>("/products");

        if (isActive) {
          setProducts(response.data.slice(0, 6));
          setLoadError(false);
        }
      } catch {
        if (isActive) {
          setLoadError(true);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadFeaturedProducts();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="mb-2 text-sm font-bold uppercase text-blue-600">
            Sản phẩm
          </p>

          <h2 className="text-3xl font-bold">Sản phẩm nổi bật</h2>
        </div>

        <a href="/products/" className="text-sm font-bold text-blue-600">
          Xem tất cả
        </a>
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse overflow-hidden rounded-3xl border bg-white"
            >
              <div className="aspect-square bg-slate-200" />
              <div className="space-y-3 p-6">
                <div className="h-4 w-1/3 rounded bg-slate-200" />
                <div className="h-6 w-3/4 rounded bg-slate-200" />
                <div className="h-4 w-full rounded bg-slate-200" />
                <div className="h-10 w-full rounded-xl bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
          <h3 className="text-xl font-bold text-red-900">
            Chưa thể tải sản phẩm nổi bật
          </h3>

          <p className="mt-3 text-sm text-red-700">
            Hãy vào trang sản phẩm để thử tải lại.
          </p>
        </section>
      ) : products.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h3 className="text-xl font-bold text-slate-900">
            Cửa hàng chưa có sản phẩm
          </h3>
        </section>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.productId} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
