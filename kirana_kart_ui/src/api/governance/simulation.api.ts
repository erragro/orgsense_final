import { governanceClient } from '../clients'
import type { SimulationRun, SimulationRunPayload } from '@/types/policy.types'

export const simulationApi = {
  run: (payload: SimulationRunPayload) =>
    governanceClient.post('/simulation/run', payload),

  health: () =>
    governanceClient.get('/simulation/health'),

  getRuns: () =>
    governanceClient.get<SimulationRun[]>('/simulation/runs'),

  getResults: (run_id: number) =>
    governanceClient.get(`/simulation/runs/${run_id}/results`),
}
