import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserPermissions {
  view: boolean
  edit: boolean
  admin: boolean
}

export interface User {
  id: number
  email: string
  full_name: string
  avatar_url?: string | null
  is_super_admin: boolean
  permissions: Record<string, UserPermissions>
}

interface AuthStore {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  setAuth: (accessToken: string, refreshToken: string, user: User) => void
  setAccessToken: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: (accessToken, refreshToken, user) => set({ accessToken, refreshToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'kk_auth',
    }
  )
)
