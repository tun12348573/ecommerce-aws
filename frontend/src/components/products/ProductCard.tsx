import Link from "next/link";

import { AddToCartButton } from "@/components/cart/AddToCartButton";
import LiveProductStock from "@/components/products/LiveProductStock";
import type { Product } from "@/types/product";

type ProductCardProps = {
  product: Product;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);
}

export function ProductCard({ product }: ProductCardProps) {
  const imageUrl = product.image?.trim();

  return (
    <article className="overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/products/${product.slug}/`}>
        <div className="flex aspect-square items-center justify-center overflow-hidden bg-gray-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              className="h-full w-full object-cover transition duration-300 hover:scale-105"
              loading="lazy"
            />
          ) : (
            <span className="text-sm font-semibold text-gray-400">
              Chưa có ảnh sản phẩm
            </span>
          )}
        </div>
      </Link>

      <div className="p-6">
        <p className="mb-2 text-sm font-semibold text-blue-600">
          {product.category}
        </p>

        <Link href={`/products/${product.slug}/`}>
          <h3 className="mb-3 text-xl font-bold hover:text-blue-600">
            {product.name}
          </h3>
        </Link>

        <p className="mb-4 line-clamp-2 text-sm text-gray-600">
          {product.description}
        </p>

        <div className="mb-5 flex items-center gap-3">
          <span className="text-xl font-extrabold text-red-600">
            {formatPrice(product.salePrice)}
          </span>

          <span className="text-sm text-gray-400 line-through">
            {formatPrice(product.price)}
          </span>
        </div>

        <div className="mt-4">
          <LiveProductStock productId={product.productId} />
        </div>

        <AddToCartButton product={product} />
      </div>
    </article>
  );
}