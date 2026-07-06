"use client";

import { useEffect, useMemo, useState } from "react";

import { ProductCard } from "@/components/products/ProductCard";
import { apiGetLive } from "@/lib/api";
import type { Product } from "@/types/product";

type ProductsResponse = {
  data: Product[];
};

type SortOption = "default" | "price_asc" | "price_desc" | "name_asc";

export function ProductCatalogClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadProducts() {
      try {
        setIsLoading(true);
        setLoadError(null);

        const response = await apiGetLive<ProductsResponse>("/products");

        if (isActive) {
          setProducts(response.data);
        }
      } catch (error) {
        if (isActive) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Không thể tải danh sách sản phẩm."
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      isActive = false;
    };
  }, [reloadToken]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((product) => product.category.trim())
          .filter(Boolean)
      )
    ).sort((first, second) => first.localeCompare(second, "vi"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const keyword = searchKeyword.trim().toLocaleLowerCase("vi-VN");

    const result = products.filter((product) => {
      const matchesSearch =
        !keyword ||
        product.name.toLocaleLowerCase("vi-VN").includes(keyword) ||
        product.description.toLocaleLowerCase("vi-VN").includes(keyword) ||
        product.category.toLocaleLowerCase("vi-VN").includes(keyword);

      const matchesCategory =
        selectedCategory === "ALL" ||
        product.category === selectedCategory;

      const matchesStock = !onlyInStock || product.stock > 0;

      return matchesSearch && matchesCategory && matchesStock;
    });

    return [...result].sort((first, second) => {
      if (sortOption === "price_asc") {
        return first.salePrice - second.salePrice;
      }

      if (sortOption === "price_desc") {
        return second.salePrice - first.salePrice;
      }

      if (sortOption === "name_asc") {
        return first.name.localeCompare(second.name, "vi");
      }

      return 0;
    });
  }, [onlyInStock, products, searchKeyword, selectedCategory, sortOption]);

  function handleResetFilters() {
    setSearchKeyword("");
    setSelectedCategory("ALL");
    setSortOption("default");
    setOnlyInStock(false);
  }

  function handleReload() {
    setReloadToken((current) => current + 1);
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_220px]">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Tìm sản phẩm
            </span>

            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="Nhập tên, mô tả hoặc danh mục..."
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Danh mục
            </span>

            <select
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
            >
              <option value="ALL">Tất cả danh mục</option>

              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Sắp xếp
            </span>

            <select
              value={sortOption}
              onChange={(event) =>
                setSortOption(event.target.value as SortOption)
              }
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
            >
              <option value="default">Sắp xếp mặc định</option>
              <option value="price_asc">Giá thấp đến cao</option>
              <option value="price_desc">Giá cao đến thấp</option>
              <option value="name_asc">Tên A đến Z</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex w-fit cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(event) => setOnlyInStock(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Chỉ hiển thị sản phẩm còn hàng
          </label>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleReload}
              disabled={isLoading}
              className="text-sm font-semibold text-slate-600 underline hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Tải lại sản phẩm
            </button>

            <button
              type="button"
              onClick={handleResetFilters}
              className="text-sm font-semibold text-slate-600 underline hover:text-slate-950"
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>
      </div>

      {loadError ? (
        <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-red-900">
            Không thể tải sản phẩm
          </h2>

          <p className="mt-3 text-sm text-red-700">{loadError}</p>

          <button
            type="button"
            onClick={handleReload}
            className="mt-6 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Thử lại
          </button>
        </section>
      ) : (
        <>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-bold">
              {isLoading ? "Đang tải sản phẩm..." : `${filteredProducts.length} sản phẩm`}
            </h2>

            <p className="text-sm text-slate-500">
              {isLoading
                ? "Đang kết nối kho hàng"
                : `Tổng cộng ${products.length} sản phẩm trong cửa hàng`}
            </p>
          </div>

          {isLoading ? (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
          ) : filteredProducts.length === 0 ? (
            <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <h3 className="text-xl font-bold text-slate-900">
                Không tìm thấy sản phẩm phù hợp
              </h3>

              <p className="mt-3 text-sm text-slate-600">
                Hãy thử đổi từ khóa tìm kiếm hoặc xóa bộ lọc.
              </p>

              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-6 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Xóa bộ lọc
              </button>
            </section>
          ) : (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.productId} product={product} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
