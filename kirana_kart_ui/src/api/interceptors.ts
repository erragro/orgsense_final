import { ingestClient, governanceClient } from './clients'
import { useAuthStore } from '@/stores/auth.store'

function getToken(): string | null {
  // Read directly from localStorage to avoid circular store import during module init
  try {
    const raw = localStorage.getItem('kk_admin_token')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { token?: string } }
    return parsed?.state?.token ?? null
  } catch {
    return null
  }
}

function handleUnauthorized() {
  useAuthStore.getState().logout()
  window.location.href = '/login'
}

// Governance client: inject X-Admin-Token
governanceClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers['X-Admin-Token'] = token
  return config
})

governanceClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) handleUnauthorized()
    return Promise.reject(error)
  }
)

// Ingest client: inject Authorization Bearer token (optional)
ingestClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

ingestClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) handleUnauthorized()
    return Promise.reject(error)
  }
)
