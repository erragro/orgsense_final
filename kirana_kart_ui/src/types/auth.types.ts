import type { AdminRole } from '@/lib/constants'

export interface AuthState {
  token: string | null
  role: AdminRole | null
}

export interface AdminUser {
  id: number
  api_token: string
  role: AdminRole
}
