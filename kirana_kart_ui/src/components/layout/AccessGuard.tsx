import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import type { AdminRole } from '@/lib/constants'
import { canAccess } from '@/lib/access'

export function AccessGuard({
  roles,
  children,
}: {
  roles: readonly AdminRole[]
  children: React.ReactNode
}) {
  const role = useAuthStore((s) => s.role)
  const location = useLocation()

  if (!role) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!canAccess(role, roles)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
