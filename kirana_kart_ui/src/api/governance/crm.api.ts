import { governanceClient } from '../clients'
import type {
  QueueListResponse,
  QueueItemDetail,
  Customer360,
  NoteRow,
  ActionRow,
  TagRow,
  CannedResponse,
  NotifListResponse,
  AgentSummary,
  AgentDashboardData,
  AdminDashboardData,
  SavedView,
  ActionRequest,
  QueueFilters,
} from '@/types/crm.types'

export const crmApi = {
  // -------------------------------------------------------------------------
  // Queue
  // -------------------------------------------------------------------------
  getQueue: (params: QueueFilters) =>
    governanceClient.get<QueueListResponse>('/crm/queue', { params }),

  getQueueItem: (id: number) =>
    governanceClient.get<QueueItemDetail>(`/crm/queue/${id}`),

  getCustomer360: (id: number) =>
    governanceClient.get<Customer360>(`/crm/queue/${id}/customer360`),

  setViewing: (id: number, action: 'acquire' | 'release') =>
    governanceClient.patch(`/crm/queue/${id}/viewing`, { action }),

  // -------------------------------------------------------------------------
  // Assignment
  // -------------------------------------------------------------------------
  assignTicket: (id: number, assigneeId: number) =>
    governanceClient.post(`/crm/queue/${id}/assign`, { assignee_id: assigneeId }),

  selfAssign: (id: number) =>
    governanceClient.post(`/crm/queue/${id}/self-assign`),

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  takeAction: (id: number, body: ActionRequest) =>
    governanceClient.post<QueueItemDetail>(`/crm/queue/${id}/action`, body),

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------
  getNotes: (id: number) =>
    governanceClient.get<NoteRow[]>(`/crm/queue/${id}/notes`),

  addNote: (id: number, body: string, noteType: string = 'INTERNAL') =>
    governanceClient.post<NoteRow>(`/crm/queue/${id}/notes`, { body, note_type: noteType }),

  updateNote: (queueId: number, noteId: number, updates: { body?: string; is_pinned?: boolean }) =>
    governanceClient.patch<NoteRow>(`/crm/queue/${queueId}/notes/${noteId}`, updates),

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------
  getActions: (id: number) =>
    governanceClient.get<ActionRow[]>(`/crm/queue/${id}/actions`),

  // -------------------------------------------------------------------------
  // Tags & Watchers
  // -------------------------------------------------------------------------
  manageTags: (id: number, add: number[], remove: number[]) =>
    governanceClient.post(`/crm/queue/${id}/tags`, { add, remove }),

  manageWatchers: (id: number, add: number[], remove: number[]) =>
    governanceClient.post(`/crm/queue/${id}/watchers`, { add, remove }),

  // -------------------------------------------------------------------------
  // Merge
  // -------------------------------------------------------------------------
  mergeTickets: (id: number, targetQueueId: number, reason?: string) =>
    governanceClient.post(`/crm/queue/${id}/merge`, { target_queue_id: targetQueueId, reason }),

  // -------------------------------------------------------------------------
  // Bulk
  // -------------------------------------------------------------------------
  bulkAssign: (queueIds: number[], assigneeId: number) =>
    governanceClient.post('/crm/queue/bulk-assign', { queue_ids: queueIds, assignee_id: assigneeId }),

  bulkEscalate: (queueIds: number[], reason: string) =>
    governanceClient.post('/crm/queue/bulk-escalate', { queue_ids: queueIds, reason }),

  bulkClose: (queueIds: number[], reason: string) =>
    governanceClient.post('/crm/queue/bulk-close', { queue_ids: queueIds, reason }),

  bulkStatus: (queueIds: number[], newStatus: string) =>
    governanceClient.post('/crm/queue/bulk-status', { queue_ids: queueIds, new_status: newStatus }),

  // -------------------------------------------------------------------------
  // Canned responses
  // -------------------------------------------------------------------------
  getCannedResponses: (params: { action_code_id?: string; issue_l1?: string }) =>
    governanceClient.get<CannedResponse[]>('/crm/canned-responses', { params }),

  // -------------------------------------------------------------------------
  // Tags library
  // -------------------------------------------------------------------------
  getTags: () =>
    governanceClient.get<TagRow[]>('/crm/tags'),

  createTag: (name: string, color: string) =>
    governanceClient.post<TagRow>('/crm/tags', { name, color }),

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  getNotifications: (params: { unread_only?: boolean; page?: number; limit?: number }) =>
    governanceClient.get<NotifListResponse>('/crm/notifications', { params }),

  markRead: (notificationIds: number[]) =>
    governanceClient.post('/crm/notifications/read', { notification_ids: notificationIds }),

  markAllRead: () =>
    governanceClient.post('/crm/notifications/read-all'),

  // -------------------------------------------------------------------------
  // Agents
  // -------------------------------------------------------------------------
  getAgents: () =>
    governanceClient.get<AgentSummary[]>('/crm/agents'),

  updateAvailability: (availability: string) =>
    governanceClient.patch('/crm/agents/availability', { availability }),

  // -------------------------------------------------------------------------
  // Saved views
  // -------------------------------------------------------------------------
  getSavedViews: () =>
    governanceClient.get<SavedView[]>('/crm/saved-views'),

  saveView: (body: {
    name: string
    filters: Record<string, unknown>
    sort_by?: string
    sort_dir?: string
    is_default?: boolean
  }) => governanceClient.post<SavedView>('/crm/saved-views', body),

  deleteView: (id: number) =>
    governanceClient.delete(`/crm/saved-views/${id}`),

  // -------------------------------------------------------------------------
  // Dashboards & Reports
  // -------------------------------------------------------------------------
  getAgentDashboard: (params: { date_from: string; date_to: string }) =>
    governanceClient.get<AgentDashboardData>('/crm/dashboard/agent', { params }),

  getAdminDashboard: (params: { date_from: string; date_to: string }) =>
    governanceClient.get<AdminDashboardData>('/crm/dashboard/admin', { params }),

  getReport: (params: {
    report_type: string
    date_from: string
    date_to: string
    queue_type?: string
    agent_id?: number
  }) => governanceClient.get<Record<string, unknown>[]>('/crm/reports', { params }),
}

// -------------------------------------------------------------------------
// SLA urgency helper (client-side computation)
// -------------------------------------------------------------------------
export function computeSLAUrgency(slaDueAt: string, slaBreached: boolean): {
  urgency: 'green' | 'amber' | 'red'
  minutesRemaining: number
} {
  const now = Date.now()
  const due = new Date(slaDueAt).getTime()
  const diffMs = due - now
  const minutesRemaining = Math.round(diffMs / 60000)

  if (slaBreached || diffMs <= 0) {
    return { urgency: 'red', minutesRemaining }
  }

  // Total SLA duration not easily known here, so use absolute thresholds:
  // red: < 30min, amber: < 90min, green: >= 90min
  if (minutesRemaining < 30) return { urgency: 'red', minutesRemaining }
  if (minutesRemaining < 90) return { urgency: 'amber', minutesRemaining }
  return { urgency: 'green', minutesRemaining }
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return 'Overdue'
  const h = Math.floor(Math.abs(minutes) / 60)
  const m = Math.abs(minutes) % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
