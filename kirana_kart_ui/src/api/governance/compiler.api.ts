import { governanceClient } from '../clients'
import type { CompilerStatus } from '@/types/kb.types'

export const compilerApi = {
  compileLatest: () =>
    governanceClient.post('/compiler/compile-latest'),

  compileVersion: (version_label: string) =>
    governanceClient.post(`/compiler/compile-version/${version_label}`),

  getStatus: (version_label: string) =>
    governanceClient.get<CompilerStatus>(`/compiler/status/${version_label}`),
}
