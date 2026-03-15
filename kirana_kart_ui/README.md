# Kirana Kart UI — Frontend

**Stack:** React 19 · TypeScript · Vite · Zustand · Axios · Tailwind CSS
**Auth:** JWT Bearer tokens with automatic refresh + OAuth social login

---

## Overview

The Kirana Kart UI is the admin dashboard for the governance control plane. It connects to two backend APIs:

- **Governance API** (`http://localhost:8001`) — Auth, users, taxonomy, KB, analytics, BI agent
- **Ingest API** (`http://localhost:8000`) — Ticket ingestion pipeline

---

## Quick Start

### Option A — Docker Compose (Recommended)

From the project root:

```bash
docker compose up --build -d
```

UI is available at `http://localhost:5173`

### Option B — Local Development

```bash
cd kirana_kart_ui/
npm install
npm run dev
```

Vite dev server starts on port 5173 by default. Set `PORT` env variable to use a different port.

### Environment Variables

The UI reads these at build time (Vite `VITE_*` prefix):

| Variable | Default | Description |
|---|---|---|
| `VITE_GOVERNANCE_API_URL` | `http://localhost:8001` | Governance backend URL |
| `VITE_INGEST_API_URL` | `http://localhost:8000` | Ingest backend URL |

Set these in a `.env.local` file for local dev overrides (gitignored).

---

## Authentication

### Login Flow

1. Navigate to `/login`
2. Enter email + password **or** click a social login button (GitHub / Google / Microsoft)
3. On success: `access_token` (JWT, 60 min) + `refresh_token` (30 days) are stored in localStorage under the key `kk_auth`
4. All API requests include `Authorization: Bearer <access_token>`
5. On 401 response: Axios interceptor automatically POSTs to `/auth/refresh`, rotates the token, and retries the original request
6. If refresh fails: user is logged out and redirected to `/login`

### OAuth Flow

Clicking "Sign in with GitHub/Google/Microsoft" navigates the browser directly to the backend OAuth endpoint (e.g. `http://localhost:8001/auth/oauth/github`). The backend handles the full OAuth consent dance and redirects back to `/auth/callback?access_token=...&refresh_token=...`. The `OAuthCallbackPage` reads the tokens from the URL, fetches user profile via `/auth/me`, stores everything in the auth store, then redirects to the dashboard.

### Signup

New users can sign up at `/signup` with full name, email, and password. New accounts automatically receive **view-only access** on all modules. An admin can grant additional permissions from the Users page.

---

## Access Control

### Permission Model

Every user has per-module `{ view, edit, admin }` permissions stored in the JWT and in Zustand:

```typescript
interface UserPermissions { view: boolean; edit: boolean; admin: boolean }
interface User {
  id: number
  email: string
  full_name: string
  avatar_url?: string | null
  is_super_admin: boolean
  permissions: Record<string, UserPermissions>  // keyed by module name
}
```

`is_super_admin = true` bypasses all permission checks.

### Modules

| Module Key | Dashboard Section |
|---|---|
| `dashboard` | Overview / home |
| `tickets` | Ticket queue + resolution |
| `taxonomy` | Issue code hierarchy |
| `knowledgeBase` | KB document management |
| `policy` | Compiled policy versions |
| `customers` | Customer records |
| `analytics` | Reports + charts |
| `system` | System status + user management |
| `biAgent` | Natural language SQL |
| `sandbox` | Testing tools |

### Checking Permissions in Components

```typescript
import { hasPermission, canView } from '@/lib/access'
import { useAuthStore } from '@/stores/auth.store'

const user = useAuthStore((s) => s.user)

// Check specific permission
if (hasPermission(user, 'taxonomy', 'edit')) { /* ... */ }

// Check view access (shorthand)
if (canView(user, 'knowledgeBase')) { /* ... */ }
```

### Route Guards

```typescript
// AuthGuard — redirects to /login if user === null
// AccessGuard — checks hasPermission(user, module, permission)
protect(SomePage, 'taxonomy', 'view')   // requires taxonomy.view
protect(UserManagementPage, 'system', 'admin')  // requires system.admin
```

---

## Project Structure

```
kirana_kart_ui/
├── public/
├── src/
│   ├── api/
│   │   ├── interceptors.ts           # Bearer token injection + 401→refresh→retry
│   │   ├── governance/
│   │   │   ├── auth.api.ts           # login, signup, refresh, logout, me
│   │   │   ├── users.api.ts          # user list + permission management
│   │   │   ├── taxonomy.api.ts       # taxonomy CRUD + versions
│   │   │   ├── tickets.api.ts
│   │   │   ├── customers.api.ts
│   │   │   ├── analytics.api.ts
│   │   │   └── bi.api.ts
│   │   └── ingest/
│   │       └── ingest.api.ts
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          # Root layout wrapper
│   │   │   ├── Sidebar.tsx           # Nav with module-based visibility
│   │   │   ├── AuthGuard.tsx         # Redirects to /login if not authenticated
│   │   │   └── AccessGuard.tsx       # Checks hasPermission(user, module, perm)
│   │   └── ui/                       # Shared UI primitives (buttons, badges, etc.)
│   │
│   ├── lib/
│   │   ├── access.ts                 # hasPermission(), canView(), AppModule, Permission types
│   │   └── constants.ts              # API URLs, module lists, app constants
│   │
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx         # Email+password + GitHub/Google/Microsoft buttons
│   │   │   ├── SignupPage.tsx        # Registration form
│   │   │   └── OAuthCallbackPage.tsx # Handles /auth/callback?access_token=...
│   │   ├── dashboard/
│   │   ├── tickets/
│   │   ├── taxonomy/
│   │   ├── knowledgeBase/
│   │   ├── customers/
│   │   ├── analytics/
│   │   ├── bi/
│   │   ├── system/
│   │   └── users/
│   │       └── UserManagementPage.tsx # User table + per-module permission editor
│   │
│   ├── router/
│   │   └── index.tsx                 # React Router v6 routes + protect() helper
│   │
│   ├── stores/
│   │   └── auth.store.ts             # Zustand store (persisted as 'kk_auth')
│   │
│   └── types/
│       └── auth.types.ts             # Re-exports from auth.store
│
├── index.html
├── vite.config.ts                    # Vite config (uses process.env.PORT)
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## Key Files

### `src/stores/auth.store.ts`

Zustand store persisted to `localStorage` key `kk_auth`:

```typescript
const useAuthStore = create<AuthStore>()(persist((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  setAuth: (accessToken, refreshToken, user) => set({ accessToken, refreshToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  logout: () => set({ accessToken: null, refreshToken: null, user: null }),
}), { name: 'kk_auth' }))
```

### `src/api/interceptors.ts`

Axios request interceptor injects `Authorization: Bearer <token>`. Response interceptor catches 401s:
- If not already refreshing: calls `/auth/refresh`, updates `accessToken`, retries
- If already refreshing: queues the request until refresh completes
- If refresh fails: calls `logout()` and redirects to `/login`

### `src/lib/access.ts`

```typescript
export type AppModule = 'dashboard' | 'tickets' | 'taxonomy' | 'knowledgeBase' |
  'policy' | 'customers' | 'analytics' | 'system' | 'biAgent' | 'sandbox'
export type Permission = 'view' | 'edit' | 'admin'

export function hasPermission(user: User | null, module: AppModule, perm: Permission): boolean
export function canView(user: User | null, module: AppModule): boolean
```

### `src/router/index.tsx`

```typescript
// Public routes
/login          → LoginPage
/signup         → SignupPage
/auth/callback  → OAuthCallbackPage

// Protected routes (inside AuthGuard)
/dashboard      → protect(DashboardPage, 'dashboard', 'view')
/tickets        → protect(TicketsPage, 'tickets', 'view')
/taxonomy       → protect(TaxonomyPage, 'taxonomy', 'view')
/kb             → protect(KBPage, 'knowledgeBase', 'view')
/users          → protect(UserManagementPage, 'system', 'admin')
// etc.
```

### `src/pages/users/UserManagementPage.tsx`

Admin page (requires `system.admin`) showing:
- User table with status badge, super admin badge, activate/deactivate toggle
- Click a user → side panel opens with all 10 modules
- Each module: View / Edit / Admin switches — saves via `PATCH /users/{id}/permissions`
- Changes take effect on the user's next login or token refresh

---

## Development Commands

```bash
# Start dev server (hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

---

## Adding a New Module

1. Add the module key to `AppModule` in `src/lib/access.ts`
2. Add a nav item in `src/components/layout/Sidebar.tsx` with `module: 'yourModule'`
3. Create the page component in `src/pages/yourModule/`
4. Add a protected route in `src/router/index.tsx`
5. Update the backend `ALL_MODULES` list in `app/admin/services/auth_service.py`
6. New users will automatically receive `can_view = true` for the new module

---

## Troubleshooting

**Blank page after OAuth login**
`/auth/callback` couldn't find tokens in the URL. Check that `FRONTEND_URL` in the backend matches the URL where the frontend is running (including port).

**`401 Unauthorized` on all requests after login**
The `access_token` may be expired and refresh is failing. Open browser DevTools → Application → Local Storage → delete `kk_auth` → refresh the page to force a new login.

**CORS error in browser**
The governance backend restricts CORS to `FRONTEND_URL`. If the frontend is running on a different port than configured (e.g., a preview server instead of Docker), update `FRONTEND_URL` in `docker-compose.yml` and restart the governance container.

**Permission denied on a page you should have access to**
Permissions are embedded in the JWT. After an admin updates your permissions, you need to log out and log back in (or wait for the current token to expire and auto-refresh) for changes to take effect.

**`kk_auth` vs `kk_admin_token`**
The old authentication system stored a static API token under `kk_admin_token`. The new JWT system uses `kk_auth`. If you have an old token in localStorage, clear it: DevTools → Application → Local Storage → delete `kk_admin_token`.
