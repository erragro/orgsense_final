/* eslint-disable react-refresh/only-export-components */
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { AccessGuard } from '@/components/layout/AccessGuard'
import { ROLE_ACCESS } from '@/lib/access'
import type { AdminRole } from '@/lib/constants'

// Lazy imports for code splitting
import { lazy, Suspense } from 'react'
import { Spinner } from '@/components/ui/Spinner'

const Loading = () => (
  <div className="flex h-64 items-center justify-center">
    <Spinner size="lg" />
  </div>
)

const wrap = (Component: React.ComponentType) => (
  <Suspense fallback={<Loading />}>
    <Component />
  </Suspense>
)

const protect = (Component: React.ComponentType, roles: readonly AdminRole[]) => (
  <AccessGuard roles={roles}>
    {wrap(Component)}
  </AccessGuard>
)

// Auth
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))

// Protected pages
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const TicketListPage = lazy(() => import('@/pages/tickets/TicketListPage'))
const TicketDetailPage = lazy(() => import('@/pages/tickets/TicketDetailPage'))
const TaxonomyPage = lazy(() => import('@/pages/taxonomy/TaxonomyPage'))
const KBPage = lazy(() => import('@/pages/knowledge-base/KBPage'))
const PolicyPage = lazy(() => import('@/pages/policy/PolicyPage'))
const CustomerListPage = lazy(() => import('@/pages/customers/CustomerListPage'))
const CustomerDetailPage = lazy(() => import('@/pages/customers/CustomerDetailPage'))
const AnalyticsPage = lazy(() => import('@/pages/analytics/AnalyticsPage'))
const SystemPage = lazy(() => import('@/pages/system/SystemPage'))
const BIAgentPage = lazy(() => import('@/pages/agents/BIAgentPage'))
const SandboxPage = lazy(() => import('@/pages/sandbox/SandboxPage'))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: wrap(LoginPage),
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <AppShell />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: protect(DashboardPage, ROLE_ACCESS.dashboard) },
      { path: 'tickets', element: protect(TicketListPage, ROLE_ACCESS.tickets) },
      { path: 'tickets/:ticketId', element: protect(TicketDetailPage, ROLE_ACCESS.tickets) },
      { path: 'taxonomy', element: protect(TaxonomyPage, ROLE_ACCESS.taxonomy) },
      { path: 'taxonomy/*', element: protect(TaxonomyPage, ROLE_ACCESS.taxonomy) },
      { path: 'knowledge-base', element: protect(KBPage, ROLE_ACCESS.knowledgeBase) },
      { path: 'knowledge-base/*', element: protect(KBPage, ROLE_ACCESS.knowledgeBase) },
      { path: 'policy', element: protect(PolicyPage, ROLE_ACCESS.policy) },
      { path: 'policy/*', element: protect(PolicyPage, ROLE_ACCESS.policy) },
      { path: 'customers', element: protect(CustomerListPage, ROLE_ACCESS.customers) },
      { path: 'customers/:customerId', element: protect(CustomerDetailPage, ROLE_ACCESS.customers) },
      { path: 'analytics', element: protect(AnalyticsPage, ROLE_ACCESS.analytics) },
      { path: 'analytics/*', element: protect(AnalyticsPage, ROLE_ACCESS.analytics) },
      { path: 'system', element: protect(SystemPage, ROLE_ACCESS.system) },
      { path: 'system/*', element: protect(SystemPage, ROLE_ACCESS.system) },
      { path: 'bi-agent', element: protect(BIAgentPage, ROLE_ACCESS.biAgent) },
      { path: 'sandbox', element: protect(SandboxPage, ROLE_ACCESS.sandbox) },
    ],
  },
])
