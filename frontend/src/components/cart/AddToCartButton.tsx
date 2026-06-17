"use client";

import { useState } from "react";
import { addToCart } from "@/lib/cart";
import type { Product } from "@/types/product";

type AddToCartButtonProps = {
  product: Product;
  quantity?: number;
  className?: string;
};

export function AddToCartButton({
  product,
  quantity = 1,
  className,
}: AddToCartButtonProps) {
  const [added, setAdded] = useState(false);

  function handleAddToCart() {
    addToCart(product, quantity);

    setAdded(true);

    setTimeout(() => {
      setAdded(false);
    }, 1200);
  }

  return (
    <button
      type="button"
      onClick={handleAddToCart}
      disabled={product.stock <= 0}
      className={
        className ||
        "w-full rounded-xl bg-black px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
      }
    >
      {product.stock <= 0
        ? "Hết hàng"
        : added
          ? "Đã thêm vào giỏ"
          : "Thêm vào giỏ hàng"}
    </button>
  );
}