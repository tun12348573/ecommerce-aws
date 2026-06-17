"use client";

import { useSyncExternalStore } from "react";
import type { CartItem } from "@/types/cart";
import { CART_UPDATED_EVENT, getCartItems } from "@/lib/cart";

function subscribeCart(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener(CART_UPDATED_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(CART_UPDATED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getCartSnapshot() {
  if (typeof window === "undefined") {
    return "[]";
  }

  return JSON.stringify(getCartItems());
}

function getServerCartSnapshot() {
  return "[]";
}

export function useCartItems() {
  const snapshot = useSyncExternalStore(
    subscribeCart,
    getCartSnapshot,
    getServerCartSnapshot
  );

  try {
    return JSON.parse(snapshot) as CartItem[];
  } catch {
    return [];
  }
}