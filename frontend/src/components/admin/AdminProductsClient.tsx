"use client";

import { FormEvent, useState } from "react";
import { apiDelete, apiPost, apiPut } from "@/lib/api";
import type { Product } from "@/types/product";

type AdminProductsClientProps = {
  initialProducts: Product[];
};

type ProductResponse = {
  data: Product;
};

type ProductFormState = {
  name: string;
  slug: string;
  category: string;
  description: string;
  price: string;
  salePrice: string;
  stock: string;
  image: string;
};

const emptyForm: ProductFormState = {
  name: "",
  slug: "",
  category: "",
  description: "",
  price: "",
  salePrice: "",
  stock: "",
  image: "",
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function productToForm(product: Product): ProductFormState {
  return {
    name: product.name,
    slug: product.slug,
    category: product.category,
    description: product.description,
    price: String(product.price),
    salePrice: String(product.salePrice),
    stock: String(product.stock),
    image: product.image,
  };
}

function formToPayload(form: ProductFormState) {
  return {
    name: form.name,
    slug: form.slug,
    category: form.category,
    description: form.description,
    price: Number(form.price),
    salePrice: Number(form.salePrice),
    stock: Number(form.stock),
    image: form.image,
  };
}

export function AdminProductsClient({
  initialProducts,
}: AdminProductsClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateForm(field: keyof ProductFormState, value: string) {
    setForm((currentForm) => {
      if (field === "name") {
        return {
          ...currentForm,
          name: value,
          slug: createSlug(value),
        };
      }

      return {
        ...currentForm,
        [field]: value,
      };
    });
  }

  function handleEditProduct(product: Product) {
    setEditingProductId(product.productId);
    setForm(productToForm(product));
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleCancelEdit() {
    setEditingProductId(null);
    setForm(emptyForm);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setIsSubmitting(true);

    try {
      const payload = formToPayload(form);

      if (editingProductId) {
        const response = await apiPut<ProductResponse, typeof payload>(
          `/admin/products/${editingProductId}`,
          payload
        );

        setProducts((currentProducts) =>
          currentProducts.map((product) =>
            product.productId === editingProductId ? response.data : product
          )
        );
      } else {
        const response = await apiPost<ProductResponse, typeof payload>(
          "/admin/products",
          payload
        );

        setProducts((currentProducts) => [response.data, ...currentProducts]);
      }

      setForm(emptyForm);
      setEditingProductId(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không thể lưu sản phẩm. Vui lòng thử lại."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteProduct(productId: string) {
    const confirmed = window.confirm("Bạn có chắc muốn xóa sản phẩm này không?");

    if (!confirmed) return;

    setError("");

    try {
      await apiDelete<ProductResponse>(`/admin/products/${productId}`);

      setProducts((currentProducts) =>
        currentProducts.filter((product) => product.productId !== productId)
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Không thể xóa sản phẩm. Vui lòng thử lại."
      );
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
      <section className="h-fit rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-2xl font-bold">
          {editingProductId ? "Sửa sản phẩm" : "Thêm sản phẩm"}
        </h2>

        {error ? (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-600">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-bold">
              Tên sản phẩm
            </label>
            <input
              required
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              className="w-full rounded-xl border px-4 py-3"
              placeholder="Ví dụ: Áo hoodie basic"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">Slug</label>
            <input
              required
              value={form.slug}
              onChange={(event) => updateForm("slug", event.target.value)}
              className="w-full rounded-xl border px-4 py-3"
              placeholder="ao-hoodie-basic"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">Danh mục</label>
            <input
              required
              value={form.category}
              onChange={(event) => updateForm("category", event.target.value)}
              className="w-full rounded-xl border px-4 py-3"
              placeholder="Thời trang"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">Mô tả</label>
            <textarea
              required
              value={form.description}
              onChange={(event) =>
                updateForm("description", event.target.value)
              }
              className="min-h-24 w-full rounded-xl border px-4 py-3"
              placeholder="Mô tả ngắn về sản phẩm..."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold">Giá gốc</label>
              <input
                required
                type="number"
                min={0}
                value={form.price}
                onChange={(event) => updateForm("price", event.target.value)}
                className="w-full rounded-xl border px-4 py-3"
                placeholder="199000"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold">Giá bán</label>
              <input
                required
                type="number"
                min={0}
                value={form.salePrice}
                onChange={(event) =>
                  updateForm("salePrice", event.target.value)
                }
                className="w-full rounded-xl border px-4 py-3"
                placeholder="159000"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">Tồn kho</label>
            <input
              required
              type="number"
              min={0}
              value={form.stock}
              onChange={(event) => updateForm("stock", event.target.value)}
              className="w-full rounded-xl border px-4 py-3"
              placeholder="100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold">
              Link ảnh sản phẩm
            </label>
            <input
              value={form.image}
              onChange={(event) => updateForm("image", event.target.value)}
              className="w-full rounded-xl border px-4 py-3"
              placeholder="https://placehold.co/600x600"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-black px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isSubmitting
              ? "Đang lưu..."
              : editingProductId
                ? "Cập nhật sản phẩm"
                : "Thêm sản phẩm"}
          </button>

          {editingProductId ? (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="w-full rounded-xl border border-gray-300 px-5 py-3 text-sm font-bold"
            >
              Hủy chỉnh sửa
            </button>
          ) : null}
        </form>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Danh sách sản phẩm</h2>
          <p className="text-sm font-bold text-blue-600">
            {products.length} sản phẩm
          </p>
        </div>

        {products.length === 0 ? (
          <div className="rounded-2xl bg-gray-50 p-8 text-center">
            <h3 className="mb-2 text-xl font-bold">Chưa có sản phẩm</h3>
            <p className="text-sm text-gray-600">
              Hãy thêm sản phẩm đầu tiên cho cửa hàng.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((product) => (
              <div
                key={product.productId}
                className="grid gap-4 rounded-2xl border p-4 md:grid-cols-[100px_1fr_auto]"
              >
                <div className="flex aspect-square items-center justify-center rounded-xl bg-gray-100">
                  <span className="text-xs font-semibold text-gray-400">
                    Ảnh
                  </span>
                </div>

                <div>
                  <p className="mb-1 text-sm font-bold text-blue-600">
                    {product.category}
                  </p>

                  <h3 className="mb-1 text-lg font-bold">{product.name}</h3>

                  <p className="mb-2 line-clamp-2 text-sm text-gray-600">
                    {product.description}
                  </p>

                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="font-bold text-red-600">
                      {formatPrice(product.salePrice)}
                    </span>

                    <span className="text-gray-400 line-through">
                      {formatPrice(product.price)}
                    </span>

                    <span className="text-gray-600">
                      Kho: {product.stock}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 md:flex-col">
                  <button
                    type="button"
                    onClick={() => handleEditProduct(product)}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-bold"
                  >
                    Sửa
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(product.productId)}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}