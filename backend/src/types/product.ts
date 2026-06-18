export type Product = {
  productId: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  salePrice: number;
  stock: number;
  image: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ProductInput = {
  name: string;
  slug: string;
  category: string;
  description: string;
  price: number;
  salePrice: number;
  stock: number;
  image: string;
};