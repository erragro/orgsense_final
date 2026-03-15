import { ingestClient, governanceClient } from './clients'
import { useAuthStore } from '@/stores/auth.store'

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

function getAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('kk_auth')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { accessToken?: string } }
    return parsed?.state?.accessToken ?? null
  } catch {
    return null
  }
}

function getRefreshToken(): string | null {
  try {
    const raw = localStorage.getItem('kk_auth')
    if (!raw) return null
    const parsed = JSON.parse(raw) as { state?: { refreshToken?: string } }
    return parsed?.state?.refreshToken ?? null
  } catch {
    return null
  }
}

function handleUnauthorized() {
  useAuthStore.getState().logout()
  window.location.href = '/login'
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const res = await governanceClient.post<{ access_token: string; refresh_token: string }>(
      '/auth/refresh',
      { refresh_token: refreshToken },
    )
    const { access_token, refresh_token } = res.data
    useAuthStore.getState().setAccessToken(access_token)
    // Update refresh token in store too
    const store = useAuthStore.getState()
    store.setAuth(access_token, refresh_token, store.user!)
    return access_token
  } catch {
    return null
  }
}

// Governance client: inject Authorization Bearer
governanceClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

governanceClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Skip refresh for auth endpoints to avoid infinite loops
      if (originalRequest.url?.includes('/auth/')) {
        handleUnauthorized()
        return Promise.reject(error)
      }

      originalRequest._retry = true

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshSubscribers.push((token) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`
            resolve(governanceClient(originalRequest))
          })
          // Add rejection handler on timeout
          setTimeout(() => reject(error), 10_000)
        })
      }

      isRefreshing = true
      try {
        const newToken = await tryRefresh()
        if (newToken) {
          onRefreshed(newToken)
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`
          return governanceClient(originalRequest)
        } else {
          handleUnauthorized()
          return Promise.reject(error)
        }
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

// Ingest client: inject Authorization Bearer
ingestClient.interceptors.request.use((config) => {
  const token = getAccessToken()
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
