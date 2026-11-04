import { api } from "./api";

export interface Category {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  parent: {
    id: string;
    name: string;
  } | null;
  _count: {
    products: number;
    children: number;
  };
}

export interface CategoryListResponse {
  data: Category[];
  count: number;
}

export interface CategoryFilters {
  search?: string;
  isActive?: "true" | "false";
  parentId?: string;
}

export async function getCategories(
  filters: CategoryFilters = {},
): Promise<CategoryListResponse> {
  const response = await api.get<CategoryListResponse>("/categories", {
    params: filters,
  });

  return response.data;
}
