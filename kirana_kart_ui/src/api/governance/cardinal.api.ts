// src/api/governance/cardinal.api.ts
// ====================================
// API client for the Cardinal Intelligence module.

import { governanceClient } from '@/api/clients'
import type {
  CardinalOverview,
  PhaseStats,
  ExecutionsResponse,
  ExecutionDetail,
  AuditResponse,
  ReprocessResult,
  ExecutionFilters,
  AuditFilters,
} from '@/types/cardinal.types'

export const cardinalApi = {
  /** Pipeline summary stats + volume trend + distributions. */
  overview: () =>
    governanceClient.get<CardinalOverview>('/cardinal/overview'),

  /** Per-phase (Cardinal phases + LLM stages) pass/fail/latency breakdown. */
  phaseStats: () =>
    governanceClient.get<PhaseStats[]>('/cardinal/phase-stats'),

  /** Paginated list of ticket executions with optional filters. */
  executions: (filters: ExecutionFilters) =>
    governanceClient.get<ExecutionsResponse>('/cardinal/executions', {
      params: filters,
    }),

  /** Full execution trace for a single ticket (all phases + LLM outputs). */
  executionDetail: (ticketId: string) =>
    governanceClient.get<ExecutionDetail>(`/cardinal/executions/${ticketId}`),

  /** Paginated execution audit log. */
  audit: (filters: AuditFilters) =>
    governanceClient.get<AuditResponse>('/cardinal/audit', {
      params: filters,
    }),

  /** Re-submit a ticket through the Cardinal pipeline. Requires cardinal.admin. */
  reprocess: (ticketId: string) =>
    governanceClient.post<ReprocessResult>(`/cardinal/reprocess/${ticketId}`),
}
