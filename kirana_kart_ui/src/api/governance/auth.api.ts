import { governanceClient } from '../clients'
import type { User } from '@/stores/auth.store'

interface TokenResponse {
  access_token: string
  refresh_token: string
  user: User
}

export const authApi = {
  login: (email: string, password: string) =>
    governanceClient.post<TokenResponse>('/auth/login', { email, password }),

  signup: (email: string, password: string, full_name: string) =>
    governanceClient.post<TokenResponse>('/auth/signup', { email, password, full_name }),

  refresh: (refresh_token: string) =>
    governanceClient.post<{ access_token: string; refresh_token: string }>(
      '/auth/refresh',
      { refresh_token }
    ),

  logout: (refresh_token: string) =>
    governanceClient.post('/auth/logout', { refresh_token }),

  me: () =>
    governanceClient.get<User>('/auth/me'),
}
