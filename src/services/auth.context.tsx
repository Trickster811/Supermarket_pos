import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { login as loginRequest } from './auth.service'
import type { AuthUser } from './auth.service'
import { api } from './api'

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'admin_access_token'
const USER_KEY = 'admin_user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function restoreSession() {
      const token = sessionStorage.getItem(TOKEN_KEY)

      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const response = await api.get<{ user: AuthUser }>('/auth/me')
        const authenticatedUser = response.data.user

        if (
          authenticatedUser.role !== 'ADMIN' &&
          authenticatedUser.role !== 'MANAGER'
        ) {
          throw new Error('Unauthorized role')
        }

        sessionStorage.setItem(USER_KEY, JSON.stringify(authenticatedUser))
        setUser(authenticatedUser)
      } catch {
        sessionStorage.removeItem(TOKEN_KEY)
        sessionStorage.removeItem(USER_KEY)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])

  async function login(username: string, password: string) {
    const result = await loginRequest(username, password)

    if (
      result.user.role !== 'ADMIN' &&
      result.user.role !== 'MANAGER'
    ) {
      throw new Error('You do not have permission to access the admin dashboard.')
    }

    sessionStorage.setItem(TOKEN_KEY, result.accessToken)
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user))

    setUser(result.user)
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}