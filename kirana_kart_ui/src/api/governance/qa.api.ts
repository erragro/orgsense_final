import { governanceClient } from '../clients'
import type {
  QASession,
  QAEvaluation,
  QAEvaluationSummary,
  QATicketResult,
  TicketSearchParams,
} from '@/types/qa.types'

export const qaApi = {
  getSessions: () =>
    governanceClient.get<QASession[]>('/qa-agent/sessions'),

  createSession: (label: string) =>
    governanceClient.post<QASession>('/qa-agent/sessions', { label }),

  renameSession: (id: number, label: string) =>
    governanceClient.patch<QASession>(`/qa-agent/sessions/${id}`, { label }),

  deleteSession: (id: number) =>
    governanceClient.delete(`/qa-agent/sessions/${id}`),

  getSessionEvaluations: (sessionId: number) =>
    governanceClient.get<QAEvaluationSummary[]>(`/qa-agent/sessions/${sessionId}/evaluations`),

  getEvaluation: (id: number) =>
    governanceClient.get<QAEvaluation>(`/qa-agent/evaluations/${id}`),

  searchTickets: (params: TicketSearchParams) =>
    governanceClient.get<QATicketResult[]>('/qa-agent/tickets/search', { params }),
}

// Note: POST /qa-agent/evaluate uses native fetch() for SSE streaming.
// See QAAgentPage.tsx for the streaming implementation.
