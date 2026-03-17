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
  BeatSchedule,
  ScheduleUpdate,
  TriggerResult,
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

  /** List all Celery Beat schedule configs. */
  schedules: () =>
    governanceClient.get<BeatSchedule[]>('/cardinal/schedules'),

  /** Update a beat schedule's enabled flag or interval. Requires cardinal.admin. */
  updateSchedule: (taskKey: string, patch: ScheduleUpdate) =>
    governanceClient.patch<BeatSchedule>(`/cardinal/schedules/${taskKey}`, patch),

  /** Manually fire a beat task immediately. Requires cardinal.admin. */
  triggerSchedule: (taskKey: string) =>
    governanceClient.post<TriggerResult>(`/cardinal/schedules/${taskKey}/trigger`),

  /** Reset a schedule to default interval and re-enable it. Requires cardinal.admin. */
  resetSchedule: (taskKey: string) =>
    governanceClient.post<BeatSchedule>(`/cardinal/schedules/${taskKey}/reset`),
}
