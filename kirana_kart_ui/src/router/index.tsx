/* eslint-disable react-refresh/only-export-components */
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGuard } from '@/components/layout/AuthGuard'
import { AccessGuard } from '@/components/layout/AccessGuard'
import type { AppModule, Permission } from '@/lib/access'

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

const protect = (Component: React.ComponentType, module: AppModule, permission: Permission = 'view') => (
  <AccessGuard module={module} permission={permission}>
    {wrap(Component)}
  </AccessGuard>
)

// Auth pages (public)
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const SignupPage = lazy(() => import('@/pages/auth/SignupPage'))
const OAuthCallbackPage = lazy(() => import('@/pages/auth/OAuthCallbackPage'))

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
const QAAgentPage = lazy(() => import('@/pages/agents/QAAgentPage'))
const SandboxPage = lazy(() => import('@/pages/sandbox/SandboxPage'))
const UserManagementPage = lazy(() => import('@/pages/users/UserManagementPage'))
const CardinalPage = lazy(() => import('@/pages/cardinal/CardinalPage'))

// CRM pages
const CRMQueuePage          = lazy(() => import('@/pages/crm/CRMQueuePage'))
const CRMWorkViewPage       = lazy(() => import('@/pages/crm/CRMWorkViewPage'))
const CRMAgentDashboardPage = lazy(() => import('@/pages/crm/CRMAgentDashboardPage'))
const CRMAdminDashboardPage = lazy(() => import('@/pages/crm/CRMAdminDashboardPage'))
const CRMReportsPage        = lazy(() => import('@/pages/crm/CRMReportsPage'))
const CRMGroupsPage         = lazy(() => import('@/pages/crm/CRMGroupsPage'))
const CRMAutomationPage     = lazy(() => import('@/pages/crm/CRMAutomationPage'))
const CRMSLAPoliciesPage    = lazy(() => import('@/pages/crm/CRMSLAPoliciesPage'))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: wrap(LoginPage),
  },
  {
    path: '/signup',
    element: wrap(SignupPage),
  },
  {
    path: '/auth/callback',
    element: wrap(OAuthCallbackPage),
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
      { path: 'dashboard', element: protect(DashboardPage, 'dashboard') },
      { path: 'tickets', element: protect(TicketListPage, 'tickets') },
      { path: 'tickets/:ticketId', element: protect(TicketDetailPage, 'tickets') },
      { path: 'taxonomy', element: protect(TaxonomyPage, 'taxonomy') },
      { path: 'taxonomy/*', element: protect(TaxonomyPage, 'taxonomy') },
      { path: 'knowledge-base', element: protect(KBPage, 'knowledgeBase') },
      { path: 'knowledge-base/*', element: protect(KBPage, 'knowledgeBase') },
      { path: 'policy', element: protect(PolicyPage, 'policy') },
      { path: 'policy/*', element: protect(PolicyPage, 'policy') },
      { path: 'customers', element: protect(CustomerListPage, 'customers') },
      { path: 'customers/:customerId', element: protect(CustomerDetailPage, 'customers') },
      { path: 'analytics', element: protect(AnalyticsPage, 'analytics') },
      { path: 'analytics/*', element: protect(AnalyticsPage, 'analytics') },
      { path: 'system', element: protect(SystemPage, 'system') },
      { path: 'system/*', element: protect(SystemPage, 'system') },
      { path: 'bi-agent', element: protect(BIAgentPage, 'biAgent') },
      { path: 'qa-agent', element: protect(QAAgentPage, 'qaAgent') },
      { path: 'sandbox', element: protect(SandboxPage, 'sandbox') },
      { path: 'cardinal', element: protect(CardinalPage, 'cardinal') },
      { path: 'cardinal/*', element: protect(CardinalPage, 'cardinal') },
      { path: 'users', element: protect(UserManagementPage, 'system', 'admin') },
      { path: 'crm',                   element: protect(CRMQueuePage,          'crm') },
      { path: 'crm/ticket/:queueId',   element: protect(CRMWorkViewPage,       'crm') },
      { path: 'crm/dashboard',         element: protect(CRMAgentDashboardPage, 'crm') },
      { path: 'crm/admin',             element: protect(CRMAdminDashboardPage, 'crm', 'admin') },
      { path: 'crm/reports',           element: protect(CRMReportsPage,        'crm', 'admin') },
      { path: 'crm/groups',            element: protect(CRMGroupsPage,         'crm', 'admin') },
      { path: 'crm/automation',        element: protect(CRMAutomationPage,     'crm', 'admin') },
      { path: 'crm/sla-policies',      element: protect(CRMSLAPoliciesPage,    'crm', 'admin') },
    ],
  },
])
