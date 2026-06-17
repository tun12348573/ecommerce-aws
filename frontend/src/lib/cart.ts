import type { Product } from "@/types/product";
import type { CartItem } from "@/types/cart";

const CART_KEY = "aws-shop-cart";

export function getCartItems(): CartItem[] {
  if (typeof window === "undefined") return [];

  const rawCart = localStorage.getItem(CART_KEY);

  if (!rawCart) return [];

  try {
    return JSON.parse(rawCart) as CartItem[];
  } catch {
    return [];
  }
}

export function saveCartItems(items: CartItem[]) {
  if (typeof window === "undefined") return;

  localStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function addToCart(product: Product, quantity = 1) {
  const currentCart = getCartItems();

  const existingItem = currentCart.find(
    (item) => item.productId === product.productId
  );

  let nextCart: CartItem[];

  if (existingItem) {
    nextCart = currentCart.map((item) => {
      if (item.productId !== product.productId) return item;

      const nextQuantity = Math.min(item.quantity + quantity, item.stock);

      return {
        ...item,
        quantity: nextQuantity,
      };
    });
  } else {
    nextCart = [
      ...currentCart,
      {
        productId: product.productId,
        name: product.name,
        slug: product.slug,
        category: product.category,
        price: product.price,
        salePrice: product.salePrice,
        stock: product.stock,
        image: product.image,
        quantity,
      },
    ];
  }

  saveCartItems(nextCart);

  return nextCart;
}

export function updateCartItemQuantity(productId: string, quantity: number) {
  const currentCart = getCartItems();

  const nextCart = currentCart
    .map((item) => {
      if (item.productId !== productId) return item;

      return {
        ...item,
        quantity: Math.min(Math.max(quantity, 1), item.stock),
      };
    })
    .filter((item) => item.quantity > 0);

  saveCartItems(nextCart);

  return nextCart;
}

export function removeCartItem(productId: string) {
  const currentCart = getCartItems();

  const nextCart = currentCart.filter((item) => item.productId !== productId);

  saveCartItems(nextCart);

  return nextCart;
}

export function clearCart() {
  saveCartItems([]);
}