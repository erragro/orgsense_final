import { governanceClient } from '../clients'
import type { AnalyticsSummary, RefundRecord, EvaluationResponse, EvaluationFilters } from '@/types/analytics.types'

export const analyticsApi = {
  getSummary: (params: { date_from?: string; date_to?: string }) =>
    governanceClient.get<AnalyticsSummary>('/analytics/summary', { params }),

  getRefunds: (params: { page?: number; limit?: number; date_from?: string; date_to?: string }) =>
    governanceClient.get<RefundRecord[]>('/analytics/refunds', { params }),

  getPolicyrules: (params: { version?: string; module?: string }) =>
    governanceClient.get('/policy/rules', { params }),

  getEvaluationFilters: () =>
    governanceClient.get<EvaluationFilters>('/analytics/evaluation-filters'),

  getEvaluations: (params: {
    page?: number
    limit?: number
    date_from?: string
    date_to?: string
    module?: string
    issue_l1?: string
    issue_l2?: string
    fraud_segment?: string
    value_segment?: string
    action_code?: string
    automation_pathway?: string
    standard_logic_passed?: string
    greedy_classification?: string
    override_applied?: string
    pipeline_stage?: string
  }) =>
    governanceClient.get<EvaluationResponse>('/analytics/evaluations', { params }),
}
