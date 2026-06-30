"use client";

import { useEffect, useState } from "react";

import { apiGetLive } from "@/lib/api";

type ProductsResponse = {
  data: Array<{
    productId: string;
    stock: number;
  }>;
};

type LiveProductStockProps = {
  productId: string;
};

export default function LiveProductStock({
  productId,
}: LiveProductStockProps) {
  const [stock, setStock] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadLiveStock() {
      try {
        const response = await apiGetLive<ProductsResponse>("/products");

        const product = response.data.find(
          (item) => item.productId === productId
        );

        if (!product) {
          throw new Error("Không tìm thấy sản phẩm.");
        }

        if (isActive) {
          setStock(product.stock);
          setHasError(false);
        }
      } catch {
        if (isActive) {
          setHasError(true);
        }
      }
    }

    void loadLiveStock();

    const timer = window.setInterval(() => {
      void loadLiveStock();
    }, 30000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [productId]);

  if (hasError && stock === null) {
    return (
      <span className="text-sm font-medium text-red-600">
        Không thể cập nhật tồn kho
      </span>
    );
  }

  if (stock === null) {
    return (
      <span className="text-sm text-slate-500">
        Đang cập nhật tồn kho...
      </span>
    );
  }

  if (stock <= 0) {
    return (
      <span className="text-sm font-semibold text-red-600">
        Tạm hết hàng
      </span>
    );
  }

  return (
    <span className="text-sm font-semibold text-emerald-600">
      Còn {stock} sản phẩm
    </span>
  );
}