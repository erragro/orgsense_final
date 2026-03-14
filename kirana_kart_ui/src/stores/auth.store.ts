import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AdminRole } from '@/lib/constants'

interface AuthStore {
  token: string | null
  role: AdminRole | null
  setAuth: (token: string, role: AdminRole) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      setAuth: (token, role) => set({ token, role }),
      logout: () => set({ token: null, role: null }),
    }),
    {
      name: 'kk_admin_token',
    }
  )
)
