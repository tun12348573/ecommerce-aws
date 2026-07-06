import { Suspense } from "react";

import { ProductDetailClient } from "@/components/products/ProductDetailClient";

function ProductDetailLoading() {
  return (
    <main className="min-h-screen bg-gray-50 px-6 py-12 text-gray-900">
      <div className="mx-auto max-w-7xl">
        <div className="grid animate-pulse gap-10 lg:grid-cols-2">
          <div className="aspect-square rounded-3xl bg-slate-200" />
          <div className="space-y-5 rounded-3xl bg-white p-8 shadow-sm">
            <div className="h-4 w-1/4 rounded bg-slate-200" />
            <div className="h-10 w-3/4 rounded bg-slate-200" />
            <div className="h-20 w-full rounded bg-slate-200" />
            <div className="h-10 w-1/3 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ProductPage() {
  return (
    <Suspense fallback={<ProductDetailLoading />}>
      <ProductDetailClient />
    </Suspense>
  );
}
