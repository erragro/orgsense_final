import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/api/governance/auth.api'
import { Spinner } from '@/components/ui/Spinner'

export default function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      setError('OAuth login failed. Missing tokens in callback.')
      return
    }

    // Temporarily store the access token so the /auth/me request is authenticated
    // We do this by calling setAuth with a placeholder user and then fetching the real user
    ;(async () => {
      try {
        // Store tokens first so the interceptor can inject the Authorization header
        useAuthStore.setState({
          accessToken,
          refreshToken,
          user: null,
        })

        const res = await authApi.me()
        setAuth(accessToken, refreshToken, res.data)
        navigate('/dashboard', { replace: true })
      } catch {
        setError('Failed to fetch user profile. Please try logging in again.')
      }
    })()
  }, [navigate, setAuth])

  if (error) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 font-medium mb-4">{error}</p>
          <a href="/login" className="text-brand-400 hover:text-brand-300 text-sm">
            Back to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-muted text-sm">Completing sign in…</p>
      </div>
    </div>
  )
}
