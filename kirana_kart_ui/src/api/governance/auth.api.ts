import { governanceClient } from '../clients'

export const authApi = {
  me: (token: string) =>
    governanceClient.get<{ role: 'viewer' | 'editor' | 'publisher' }>('/auth/me', {
      headers: { 'X-Admin-Token': token },
    }),
}
