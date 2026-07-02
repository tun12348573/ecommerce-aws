"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import {
  getCustomerSessionServerSnapshot,
  getCustomerSessionSnapshot,
  signOutCustomer,
  subscribeToCustomerSession,
} from "@/lib/customer-auth";

export function CustomerAccountMenu() {
  const router = useRouter();

  const customerEmail = useSyncExternalStore(
    subscribeToCustomerSession,
    getCustomerSessionSnapshot,
    getCustomerSessionServerSnapshot
  );

  const [isOpen, setIsOpen] = useState(false);

  function handleSignOut() {
    signOutCustomer();
    setIsOpen(false);
    router.replace("/products/");
  }

  if (!customerEmail) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/account/login/"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Đăng nhập
        </Link>

      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
      >
        <span className="max-w-36 truncate sm:max-w-48">
          {customerEmail}
        </span>

        <span className="text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
          <Link
            href="/account/orders/"
            onClick={() => setIsOpen(false)}
            className="block px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Đơn hàng của tôi
          </Link>

          <Link
            href="/account/"
            onClick={() => setIsOpen(false)}
            className="block px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Tài khoản của tôi
          </Link>

          <div className="my-2 border-t border-slate-100" />

          <button
            type="button"
            onClick={handleSignOut}
            className="block w-full px-4 py-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Đăng xuất
          </button>
        </div>
      ) : null}
    </div>
  );
}