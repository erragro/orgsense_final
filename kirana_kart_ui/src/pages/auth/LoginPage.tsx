import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/api/governance/auth.api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { AdminRole } from '@/lib/constants'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAuthStore()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard'

  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('Token is required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await authApi.me(token.trim())
      const resolvedRole = response.data?.role as AdminRole | undefined
      if (!resolvedRole) {
        throw new Error('Missing role')
      }
      setAuth(token.trim(), resolvedRole)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const axiosError = err as { response?: { status: number } }
      if (axiosError.response?.status === 401) {
        setError('Invalid or expired token. Please check your admin token.')
      } else if (axiosError.response?.status === 403) {
        setError('Access denied. Your token may not have sufficient permissions.')
      } else if (err instanceof Error && err.message === 'Missing role') {
        setError('Unable to resolve access level for this token.')
      } else {
        // If backend is unreachable, allow login with warning
        setAuth(token.trim(), 'viewer')
        navigate(from, { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-brand-600 flex items-center justify-center mb-4 shadow-lg shadow-brand-600/20">
            <span className="text-white text-2xl font-bold">KK</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Kirana Kart</h1>
          <p className="text-muted text-sm mt-1">Governance Console</p>
        </div>

        {/* Login card */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-6 shadow-xl">
          <h2 className="text-base font-semibold text-foreground mb-5">Sign in with Admin Token</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Admin Token"
              type="password"
              id="token"
              placeholder="Enter your admin token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              error={error}
              autoComplete="off"
              autoFocus
            />

            <Button
              type="submit"
              className="w-full mt-2"
              loading={loading}
              disabled={!token.trim()}
            >
              Sign In
            </Button>
          </form>

          <div className="mt-4 p-3 bg-surface rounded-md border border-surface-border">
            <p className="text-xs text-subtle">
              <span className="font-medium text-muted">Roles:</span>{' '}
              <span className="text-subtle">viewer</span> (read-only) ·{' '}
              <span className="text-subtle">editor</span> (add/update) ·{' '}
              <span className="text-subtle">publisher</span> (full access)
            </p>
            <p className="text-xs text-subtle mt-2">
              Access level is determined by the token.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-subtle mt-6">
          Kirana Kart v3.3.0 · Policy Governance Engine
        </p>
      </div>
    </div>
  )
}
