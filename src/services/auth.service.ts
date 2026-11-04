import { api } from './api'

export interface AuthUser {
  id: string
  fullName: string
  username: string
  role: 'ADMIN' | 'MANAGER' | 'CASHIER'
}

export interface LoginResponse {
  message: string
  accessToken: string
  tokenType: string
  expiresIn: number
  user: AuthUser
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const response = await api.post<LoginResponse>('/auth/login', {
    username,
    password,
  })

  return response.data
}