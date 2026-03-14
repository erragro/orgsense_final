import type { AdminRole } from '@/lib/constants'

export const ROLE_ACCESS = {
  dashboard: ['viewer', 'editor', 'publisher'],
  tickets: ['viewer', 'editor', 'publisher'],
  taxonomy: ['viewer', 'editor', 'publisher'],
  knowledgeBase: ['viewer', 'editor', 'publisher'],
  policy: ['viewer', 'editor', 'publisher'],
  customers: ['viewer', 'editor', 'publisher'],
  analytics: ['viewer', 'editor', 'publisher'],
  system: ['publisher'],
  biAgent: ['viewer', 'editor', 'publisher'],
} as const satisfies Record<string, readonly AdminRole[]>

export type AccessKey = keyof typeof ROLE_ACCESS

export function canAccess(role: AdminRole | null | undefined, allowed: readonly AdminRole[]) {
  return !!role && allowed.includes(role)
}
