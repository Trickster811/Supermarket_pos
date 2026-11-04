import { api } from "./api";

export type SellingMode = "UNIT" | "WEIGHT";

export type UnitOfMeasure =
  | "PIECE"
  | "PACKET"
  | "BOTTLE"
  | "BOX"
  | "KG"
  | "GRAM"
  | "LITRE";

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  pluCode: string | null;
  sellingMode: SellingMode;
  unitOfMeasure: UnitOfMeasure;
  price: string;
  taxRate: string;
  categoryId: string | null;
  category: {
    id: string;
    name: string;
  } | null;
  trackInventory: boolean;
  isActive: boolean;
  isArchived: boolean;
  archivedAt: string | null;
}

export interface ProductDetails extends Product {
  inventory: {
    id: string;
    quantity: string;
    updatedAt: string;
  } | null;
}

export interface ProductFilters {
  search?: string;
  categoryId?: string;
  sellingMode?: SellingMode;
  isActive?: "true" | "false";
  isArchived?: "true" | "false" | "all";
  page?: number;
  limit?: number;
}

export interface ProductListResponse {
  data: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateProductData {
  sku: string;
  name: string;
  description?: string;
  barcode?: string | null;
  pluCode?: string | null;
  sellingMode: SellingMode;
  unitOfMeasure: UnitOfMeasure;
  price: string;
  taxRate?: string;
  categoryId?: string | null;
  trackInventory?: boolean;
}

export type UpdateProductData = Partial<CreateProductData>;

export interface SkuSuggestionResponse {
  sku: string;
}

export async function getProducts(
  filters: ProductFilters = {},
): Promise<ProductListResponse> {
  const response = await api.get<ProductListResponse>("/products", {
    params: filters,
  });

  return response.data;
}

export async function getProduct(id: string): Promise<ProductDetails> {
  const response = await api.get<ProductDetails>(`/products/${id}`);
  return response.data;
}

export async function getSkuSuggestion(
  name: string,
  categoryId?: string | null,
): Promise<string> {
  const response = await api.get<SkuSuggestionResponse>(
    "/products/sku-suggestion",
    {
      params: {
        name,
        ...(categoryId ? { categoryId } : {}),
      },
    },
  );

  return response.data.sku;
}

export async function createProduct(data: CreateProductData): Promise<Product> {
  const response = await api.post<Product>("/products", data);
  return response.data;
}

export async function updateProduct(
  id: string,
  data: UpdateProductData,
): Promise<Product> {
  const response = await api.patch<Product>(`/products/${id}`, data);
  return response.data;
}

export async function updateProductStatus(
  id: string,
  isActive: boolean,
): Promise<Product> {
  const response = await api.patch<Product>(`/products/${id}/status`, {
    isActive,
  });

  return response.data;
}

export async function archiveProduct(id: string): Promise<Product> {
  const response = await api.patch<Product>(`/products/${id}/archive`);
  return response.data;
}

export async function restoreProduct(id: string): Promise<Product> {
  const response = await api.patch<Product>(`/products/${id}/restore`);
  return response.data;
}
