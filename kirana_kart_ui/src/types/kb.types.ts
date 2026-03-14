export interface KBRawUpload {
  id: number
  document_id: string
  original_filename: string
  original_format: string
  raw_content: string
  upload_status: string
  uploaded_by: string | null
  uploaded_at: string
  compile_errors: unknown | null
  compiled_hash: string | null
  markdown_content: string | null
  version_label: string
  is_active: boolean
  registry_status: string
  updated_at: string
}

export interface KBVersion {
  id: number
  version_label: string
  status: string
  created_by: string | null
  created_at: string
  snapshot_data: unknown
}

export interface KBDraft {
  id: number
  document_id: string
  title: string
  domain: string
  category: string
  subcategory: string | null
  content: string
  risk_level: string
  auto_resolution_allowed: boolean
  escalation_required: boolean
  linked_issue_codes: string[]
  version_label: string
  created_at: string
  updated_at: string
}

export interface KBActiveVersion {
  active_version: string
  activated_at: string
}

export interface KBUploadPayload {
  document_id: string
  original_filename: string
  original_format: string
  raw_content: string
  uploaded_by: string
  version_label: string
}

export interface CompilerStatus {
  version_label: string
  status: string
  policy_version?: string
  artifact_hash?: string
  is_active?: boolean
  error?: string
}

export interface VectorJob {
  id: number
  version_label: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
}
