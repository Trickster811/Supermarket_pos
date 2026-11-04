import { api } from "./api";

export type UserRole = "ADMIN" | "MANAGER" | "CASHIER";

export interface User {
  id: string;
  fullName: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsersListResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UsersFilters {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export async function getUsers(
  filters: UsersFilters = {},
): Promise<UsersListResponse> {
  const response = await api.get<UsersListResponse>("/users", {
    params: filters,
  });

  return response.data;
}

export interface Cashier {
  id: string;
  fullName: string;
  username: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  isActive: boolean;
}

export interface UsersPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UsersResponse {
  users: Cashier[];
  pagination: UsersPagination;
}

export async function getCashiers(): Promise<Cashier[]> {
  const response = await api.get<UsersResponse>("/users", {
    params: {
      role: "CASHIER",
      isActive: true,
      page: 1,
      limit: 100,
    },
  });

  return response.data.users;
}

export interface CreateUserPayload {
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
}

export interface CreateUserResponse {
  message: string;
  user: User;
}

export async function createUser(
  payload: CreateUserPayload,
): Promise<CreateUserResponse> {
  const response = await api.post<CreateUserResponse>("/users", payload);

  return response.data;
}

export interface UpdateUserPayload {
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UpdateUserResponse {
  message: string;
  user: User;
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<UpdateUserResponse> {
  const response = await api.patch<UpdateUserResponse>(`/users/${id}`, payload);

  return response.data;
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
): Promise<{ message: string }> {
  const response = await api.post<{ message: string }>(
    `/users/${id}/reset-password`,
    { newPassword },
  );

  return response.data;
}
