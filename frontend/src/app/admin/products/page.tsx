"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
type ChangeEvent,
type FormEvent,
useEffect,
useMemo,
useState,
} from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminAuthError } from "@/lib/admin-auth";
import {
adminDelete,
adminGet,
adminPost,
adminPut,
} from "@/lib/admin-api";
import { uploadProductImage } from "@/lib/product-image-upload";
import type { Product } from "@/types/product";

type ProductsResponse = {
data: Product[];
};

type ProductResponse = {
data: Product;
};

type ProductForm = {
name: string;
slug: string;
category: string;
description: string;
price: string;
salePrice: string;
stock: string;
image: string;
};

type ProductPayload = {
name: string;
slug: string;
category: string;
description: string;
price: number;
salePrice: number;
stock: number;
image: string;
};

const emptyForm: ProductForm = {
name: "",
slug: "",
category: "",
description: "",
price: "",
salePrice: "",
stock: "",
image: "",
};

function createSlug(value: string): string {
return value
.trim()
.toLowerCase()
.normalize("NFD")
.replace(/[\u0300-\u036f]/g, "")
.replace(/đ/g, "d")
.replace(/[^a-z0-9]+/g, "-")
.replace(/^-+|-+$/g, "");
}

function formatMoney(value: number): string {
return new Intl.NumberFormat("vi-VN", {
style: "currency",
currency: "VND",
maximumFractionDigits: 0,
}).format(value);
}

function AdminProductsContent() {
const router = useRouter();

const [products, setProducts] = useState<Product[]>([]);
const [form, setForm] = useState<ProductForm>(emptyForm);
const [editingProductId, setEditingProductId] = useState<string | null>(
null
);

const [isLoading, setIsLoading] = useState(true);
const [isSaving, setIsSaving] = useState(false);
const [isUploadingImage, setIsUploadingImage] = useState(false);
const [deletingProductId, setDeletingProductId] = useState<string | null>(
null
);

const [errorMessage, setErrorMessage] = useState("");
const [successMessage, setSuccessMessage] = useState("");

useEffect(() => {
let isMounted = true;

async function loadInitialProducts() {
  try {
    const response = await adminGet<ProductsResponse>("/admin/products");

    if (isMounted) {
      setProducts(response.data ?? []);
      setErrorMessage("");
    }
  } catch (error) {
    if (!isMounted) {
      return;
    }

    if (error instanceof AdminAuthError) {
      router.replace("/admin/login");
      return;
    }

    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Không thể tải danh sách sản phẩm."
    );
  } finally {
    if (isMounted) {
      setIsLoading(false);
    }
  }
}

void loadInitialProducts();

return () => {
  isMounted = false;
};

}, [router]);

const totalStock = useMemo(() => {
return products.reduce((total, product) => {
return total + (Number(product.stock) || 0);
}, 0);
}, [products]);

async function handleRefresh() {
setIsLoading(true);
setErrorMessage("");
setSuccessMessage("");

try {
  const response = await adminGet<ProductsResponse>("/admin/products");

  setProducts(response.data ?? []);
} catch (error) {
  if (error instanceof AdminAuthError) {
    router.replace("/admin/login");
    return;
  }

  setErrorMessage(
    error instanceof Error
      ? error.message
      : "Không thể tải danh sách sản phẩm."
  );
} finally {
  setIsLoading(false);
}

}

async function handleImageFileChange(
  event: ChangeEvent<HTMLInputElement>
) {
  const input = event.currentTarget;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  setErrorMessage("");
  setSuccessMessage(`Đã chọn "${file.name}". Đang upload ảnh lên S3...`);
  setIsUploadingImage(true);

  try {
    const imageUrl = await uploadProductImage(file);

    setForm((currentForm) => ({
      ...currentForm,
      image: imageUrl,
    }));

    setSuccessMessage(
      "Đã upload ảnh thành công. URL CloudFront đã được điền vào form."
    );
  } catch (error) {
    if (error instanceof AdminAuthError) {
      router.replace("/admin/login");
      return;
    }

    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Không thể upload ảnh sản phẩm."
    );
  } finally {
    input.value = "";
    setIsUploadingImage(false);
  }
}

function buildPayload(): ProductPayload {
const name = form.name.trim();
const slug = form.slug.trim() || createSlug(name);
const category = form.category.trim();
const description = form.description.trim();

const price = Number(form.price);
const salePrice = Number(form.salePrice);
const stock = Number(form.stock);

if (!name || !slug || !category || !description) {
  throw new Error("Vui lòng nhập đầy đủ tên, slug, danh mục và mô tả.");
}

if (
  !Number.isFinite(price) ||
  !Number.isFinite(salePrice) ||
  !Number.isFinite(stock) ||
  price < 0 ||
  salePrice < 0 ||
  stock < 0
) {
  throw new Error("Giá và tồn kho phải là số không âm.");
}

if (!Number.isInteger(stock)) {
  throw new Error("Tồn kho phải là số nguyên.");
}

if (salePrice > price) {
  throw new Error("Giá khuyến mãi không được lớn hơn giá gốc.");
}

return {
  name,
  slug,
  category,
  description,
  price,
  salePrice,
  stock,
  image: form.image.trim() || "https://placehold.co/600x600",
};

}

async function handleSubmit(event: FormEvent<HTMLFormElement>) {
event.preventDefault();

setErrorMessage("");
setSuccessMessage("");
setIsSaving(true);

try {
  const payload = buildPayload();

  if (editingProductId) {
    const response = await adminPut<ProductResponse, ProductPayload>(
      `/admin/products/${editingProductId}`,
      payload
    );

    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.productId === editingProductId ? response.data : product
      )
    );

    setSuccessMessage("Đã cập nhật sản phẩm.");
  } else {
    const response = await adminPost<ProductResponse, ProductPayload>(
      "/admin/products",
      payload
    );

    setProducts((currentProducts) => [response.data, ...currentProducts]);

    setSuccessMessage("Đã thêm sản phẩm mới.");
  }

  setForm(emptyForm);
  setEditingProductId(null);
} catch (error) {
  if (error instanceof AdminAuthError) {
    router.replace("/admin/login");
    return;
  }

  setErrorMessage(
    error instanceof Error
      ? error.message
      : "Không thể lưu sản phẩm."
  );
} finally {
  setIsSaving(false);
}

}

function handleEdit(product: Product) {
setForm({
name: product.name || "",
slug: product.slug || "",
category: product.category || "",
description: product.description || "",
price: String(product.price ?? ""),
salePrice: String(product.salePrice ?? ""),
stock: String(product.stock ?? ""),
image: product.image || "",
});

setEditingProductId(product.productId);
setErrorMessage("");
setSuccessMessage("");

window.scrollTo({
  top: 0,
  behavior: "smooth",
});

}

function handleCancelEdit() {
setForm(emptyForm);
setEditingProductId(null);
setErrorMessage("");
}

async function handleDelete(product: Product) {
const confirmed = window.confirm(
`Bạn có chắc muốn xóa sản phẩm "${product.name}" không?`
);

if (!confirmed) {
  return;
}

setDeletingProductId(product.productId);
setErrorMessage("");
setSuccessMessage("");

try {
  await adminDelete<ProductResponse>(
    `/admin/products/${product.productId}`
  );

  setProducts((currentProducts) =>
    currentProducts.filter(
      (item) => item.productId !== product.productId
    )
  );

  if (editingProductId === product.productId) {
    handleCancelEdit();
  }

  setSuccessMessage("Đã xóa sản phẩm.");
} catch (error) {
  if (error instanceof AdminAuthError) {
    router.replace("/admin/login");
    return;
  }

  setErrorMessage(
    error instanceof Error
      ? error.message
      : "Không thể xóa sản phẩm."
  );
} finally {
  setDeletingProductId(null);
}

}

return ( <main className="mx-auto min-h-screen max-w-7xl px-6 py-10"> <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between"> <div> <p className="text-sm font-semibold text-slate-500">
ECOMMERCE AWS ADMIN </p>
      <h1 className="mt-1 text-3xl font-bold text-slate-900">
        Quản lý sản phẩm
      </h1>

      <p className="mt-2 text-sm text-slate-600">
        Thêm, sửa và xóa sản phẩm trực tiếp trong DynamoDB.
      </p>
    </div>

    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={isLoading}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? "Đang tải..." : "Tải lại"}
      </button>

      <Link
        href="/admin"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
      >
        ← Dashboard
      </Link>
    </div>
  </header>

  <section className="mt-8 grid gap-5 sm:grid-cols-2">
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        Tổng sản phẩm
      </p>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {isLoading ? "..." : products.length}
      </p>
    </article>

    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        Tổng tồn kho
      </p>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {isLoading ? "..." : totalStock}
      </p>
    </article>
  </section>

  {errorMessage ? (
    <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
      {errorMessage}
    </p>
  ) : null}

  {successMessage ? (
    <p className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {successMessage}
    </p>
  ) : null}

  <section className="mt-8 grid gap-8 lg:grid-cols-[390px_1fr]">
    <form
      onSubmit={handleSubmit}
      className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">
          {editingProductId ? "Cập nhật sản phẩm" : "Thêm sản phẩm"}
        </h2>

        {editingProductId ? (
          <button
            type="button"
            onClick={handleCancelEdit}
            className="text-sm font-semibold text-slate-600 hover:text-slate-950"
          >
            Hủy sửa
          </button>
        ) : null}
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Tên sản phẩm
          </span>

          <input
            value={form.name}
            onChange={(event) => {
              const nextName = event.target.value;

              setForm((currentForm) => ({
                ...currentForm,
                name: nextName,
                slug: currentForm.slug || createSlug(nextName),
              }));
            }}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
            placeholder="Ví dụ: Áo hoodie basic"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Slug
          </span>

          <input
            value={form.slug}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                slug: createSlug(event.target.value),
              }))
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
            placeholder="ao-hoodie-basic"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Danh mục
          </span>

          <input
            value={form.category}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                category: event.target.value,
              }))
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
            placeholder="Thời trang"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Mô tả
          </span>

          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                description: event.target.value,
              }))
            }
            className="mt-2 min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
            placeholder="Mô tả ngắn về sản phẩm"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Giá gốc
            </span>

            <input
              type="number"
              min="0"
              step="1000"
              value={form.price}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  price: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
              placeholder="299000"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Giá bán
            </span>

            <input
              type="number"
              min="0"
              step="1000"
              value={form.salePrice}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  salePrice: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
              placeholder="249000"
              required
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Tồn kho
          </span>

          <input
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                stock: event.target.value,
              }))
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
            placeholder="50"
            required
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Link ảnh
          </span>

          <input
            type="url"
            value={form.image}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                image: event.target.value,
              }))
            }
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-slate-900"
            placeholder="https://..."
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Upload ảnh từ máy
          </span>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              void handleImageFileChange(event);
            }}
            disabled={isUploadingImage}
            className="mt-2 block w-full cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <span className="mt-2 block text-xs text-slate-500">
            Chỉ nhận JPG, PNG hoặc WEBP. Tối đa 5 MB.
          </span>
        </label>

        {isUploadingImage ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Đang upload ảnh lên S3...
          </p>
        ) : null}

        {form.image ? (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">
              Xem trước ảnh
            </p>

            <img
              src={form.image}
              alt="Xem trước ảnh sản phẩm"
              className="mt-3 aspect-square w-full rounded-lg border border-slate-100 object-cover"
            />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSaving || isUploadingImage}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploadingImage
            ? "Đang upload ảnh..."
            : isSaving
              ? "Đang lưu..."
              : editingProductId
                ? "Lưu thay đổi"
                : "Thêm sản phẩm"}
        </button>
      </div>
    </form>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-5 py-4 font-semibold">Sản phẩm</th>
              <th className="px-5 py-4 font-semibold">Danh mục</th>
              <th className="px-5 py-4 font-semibold">Giá bán</th>
              <th className="px-5 py-4 font-semibold">Tồn kho</th>
              <th className="px-5 py-4 font-semibold">Thao tác</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-slate-500"
                >
                  Đang tải sản phẩm...
                </td>
              </tr>
            ) : null}

            {!isLoading && products.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-slate-500"
                >
                  Chưa có sản phẩm nào.
                </td>
              </tr>
            ) : null}

            {!isLoading
              ? products.map((product) => (
                  <tr key={product.productId}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {product.name}
                      </p>

                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {product.slug}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {product.category}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">
                        {formatMoney(product.salePrice)}
                      </p>

                      <p className="mt-1 text-xs text-slate-500 line-through">
                        {formatMoney(product.price)}
                      </p>
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {product.stock}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(product)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Sửa
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDelete(product)}
                          disabled={
                            deletingProductId === product.productId
                          }
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingProductId === product.productId
                            ? "Đang xóa..."
                            : "Xóa"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </section>
  </section>
</main>

);
}

export default function AdminProductsPage() {
return ( <AdminGuard> <AdminProductsContent /> </AdminGuard>
);
}
