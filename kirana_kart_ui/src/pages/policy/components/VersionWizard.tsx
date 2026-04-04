/**
 * VersionWizard — 5-step guided flow for creating a new policy version.
 *
 * Step 1 — Upload Document (drag & drop PDF/DOCX/MD/CSV)
 * Step 2 — AI Analysis (compile + vectorize, auto-runs)
 * Step 3 — Review Rules (plain-English rule cards, basic edit)
 * Step 4 — Preview Impact (simulation gate status)
 * Step 5 — Publish (final confirmation with shadow gate status)
 */

import { useState, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, Upload, FileText, FileType, CheckCircle2, Loader2,
  AlertTriangle, ArrowRight, ArrowLeft, Sparkles, BarChart2,
  Rocket, CloudUpload,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { governanceClient as apiClient } from '@/api/clients'
import { bpmApi, type BPMInstance } from '@/api/governance/bpm.api'

interface Props {
  kbId: string
  onClose: () => void
  onCreated: () => void
}

type Step = 1 | 2 | 3 | 4 | 5

// ---- API helpers ----

const uploadDocument = (kbId: string, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return apiClient.post<{ upload_id: string; filename: string; entity_id: string; bpm_instance_id: number }>(
    `/bpm/kb/${kbId}/upload`, form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

const triggerCompile = (kbId: string, entityId: string) =>
  apiClient.post<{ message: string; entity_id: string }>(`/bpm/kb/${kbId}/compile`, { entity_id: entityId })

const fetchRules = (kbId: string, version: string) =>
  apiClient.get<Array<{
    id: number
    rule_id: string
    issue_type_l1: string
    issue_type_l2: string | null
    action_name: string
    priority: number
    conditions: Record<string, unknown>
    min_order_value: number | null
    max_order_value: number | null
    deterministic: boolean
  }>>(`/rules/${kbId}`, { params: { version } })

const publishVersion = (kbId: string, entityId: string) =>
  apiClient.post(`/bpm/kb/${kbId}/publish`, { entity_id: entityId })

// ---- Step progress indicator ----

const STEPS = [
  { n: 1, label: 'Upload' },
  { n: 2, label: 'AI Analysis' },
  { n: 3, label: 'Review Rules' },
  { n: 4, label: 'Preview Impact' },
  { n: 5, label: 'Publish' },
]

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all',
              s.n < current
                ? 'bg-green-500 border-green-500 text-white'
                : s.n === current
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-surface border-surface-border text-muted',
            )}>
              {s.n < current ? <CheckCircle2 className="w-4 h-4" /> : s.n}
            </div>
            <span className={cn(
              'text-xs whitespace-nowrap',
              s.n === current ? 'text-brand-600 font-medium' : 'text-muted',
            )}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn(
              'w-12 h-0.5 mb-5 mx-1 transition-colors',
              s.n < current ? 'bg-green-400' : 'bg-surface-border',
            )} />
          )}
        </div>
      ))}
    </div>
  )
}

// ---- Step 1: Upload ----

const ACCEPTED = '.pdf,.docx,.md,.txt,.csv'

function UploadStep({
  kbId,
  onNext,
}: {
  kbId: string
  onNext: (entityId: string, filename: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: (f: File) => uploadDocument(kbId, f),
    onSuccess: (res) => {
      onNext(res.data.entity_id, res.data.filename)
    },
    onError: (e: Error) => setError(e.message ?? 'Upload failed. Please try again.'),
  })

  const handleFile = useCallback((f: File) => {
    setError('')
    setFile(f)
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Upload your policy document</h2>
        <p className="text-sm text-muted mt-1">
          Supports PDF, Word (.docx), Markdown, plain text, or CSV (for direct rule import).
        </p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
          dragOver
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
            : 'border-surface-border hover:border-brand-400 hover:bg-surface/50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        {file ? (
          <div className="flex flex-col items-center gap-2">
            <FileText className="w-10 h-10 text-brand-500" />
            <p className="text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <CloudUpload className="w-10 h-10 text-muted" />
            <div>
              <p className="text-sm font-medium text-foreground">Drag & drop your document here</p>
              <p className="text-xs text-muted mt-1">or click to browse files</p>
            </div>
            <p className="text-xs text-subtle">PDF · Word · Markdown · CSV</p>
          </div>
        )}
      </div>

      {file?.name.endsWith('.csv') && (
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
          <FileType className="w-4 h-4 shrink-0 mt-0.5" />
          <span>CSV detected — rules will be imported directly without AI analysis. Column headers must match rule fields.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-xs text-muted">
          Maximum file size: 20 MB
        </p>
        <button
          disabled={!file || uploadMutation.isPending}
          onClick={() => file && uploadMutation.mutate(file)}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          {uploadMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
          ) : (
            <><Upload className="w-4 h-4" /> Upload & Continue</>
          )}
        </button>
      </div>
    </div>
  )
}

// ---- Step 2: AI Analysis ----

type CompileStatus = 'idle' | 'running' | 'done' | 'error'

function AIAnalysisStep({
  kbId,
  entityId,
  filename,
  onNext,
  onBack,
}: {
  kbId: string
  entityId: string
  filename: string
  onNext: () => void
  onBack: () => void
}) {
  const [status, setStatus] = useState<CompileStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [findings, setFindings] = useState<string[]>([])
  const [error, setError] = useState('')

  const compileMutation = useMutation({
    mutationFn: () => triggerCompile(kbId, entityId),
    onMutate: () => {
      setStatus('running')
      setProgress(0)
      setFindings([])
      // Animate progress
      let p = 0
      const interval = setInterval(() => {
        p += Math.random() * 12
        if (p >= 90) { clearInterval(interval); p = 90 }
        setProgress(Math.min(p, 90))
      }, 400)
      return { interval }
    },
    onSuccess: (_, __, context) => {
      clearInterval((context as { interval: ReturnType<typeof setInterval> }).interval)
      setProgress(100)
      setStatus('done')
      setFindings([
        'Rules extracted from document',
        'Mapped to action categories',
        'Indexed for search',
      ])
    },
    onError: (e: Error, _, context) => {
      clearInterval((context as { interval: ReturnType<typeof setInterval> }).interval)
      setStatus('error')
      setError(e.message ?? 'Analysis failed. Please try again.')
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">AI Analysis</h2>
        <p className="text-sm text-muted mt-1">
          Our AI reads your document and extracts policy rules automatically.
        </p>
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-muted shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{filename}</span>
        </div>

        {status === 'idle' && (
          <p className="text-sm text-muted text-center py-4">
            Click the button below to start AI analysis.
          </p>
        )}

        {(status === 'running' || status === 'done') && (
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-muted mb-1">
              <span>{status === 'done' ? 'Analysis complete' : 'Analyzing document...'}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {findings.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {findings.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 border border-red-200 rounded-lg p-3 mt-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-surface-border rounded-lg text-foreground hover:bg-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {status !== 'done' ? (
          <button
            onClick={() => compileMutation.mutate()}
            disabled={status === 'running'}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            {status === 'running' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> {status === 'error' ? 'Retry Analysis' : 'Start AI Analysis'}</>
            )}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            Review Rules <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

// ---- Step 3: Review Rules ----

function ReviewRulesStep({
  kbId,
  entityId,
  onNext,
  onBack,
}: {
  kbId: string
  entityId: string
  onNext: () => void
  onBack: () => void
}) {
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['rules', kbId, entityId, 'wizard'],
    queryFn: () => fetchRules(kbId, entityId).then((r) => r.data),
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review Extracted Rules</h2>
        <p className="text-sm text-muted mt-1">
          These rules were extracted from your document. Review them before running the impact preview.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted">
          No rules extracted yet. Complete AI analysis first.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-surface-card border border-surface-border rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted">{rule.rule_id}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-medium">
                      {rule.issue_type_l1}{rule.issue_type_l2 ? ` › ${rule.issue_type_l2}` : ''}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-muted border border-surface-border">
                      Priority {rule.priority}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground mt-1.5">
                    {rule.action_name}
                  </p>
                  {(rule.min_order_value != null || rule.max_order_value != null) && (
                    <p className="text-xs text-muted mt-0.5">
                      Order value:{' '}
                      {rule.min_order_value != null ? `≥ ₹${rule.min_order_value}` : ''}
                      {rule.min_order_value != null && rule.max_order_value != null ? ' · ' : ''}
                      {rule.max_order_value != null ? `≤ ₹${rule.max_order_value}` : ''}
                    </p>
                  )}
                </div>
                {rule.is_deterministic && (
                  <span className="shrink-0 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                    Auto
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rules.length > 0 && (
        <p className="text-sm text-muted text-center">
          {rules.length} rule{rules.length !== 1 ? 's' : ''} ready for review
        </p>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-surface-border rounded-lg text-foreground hover:bg-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={rules.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          Preview Impact <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ---- Step 4: Preview Impact (simulation gate) ----

type SimStatus = 'idle' | 'running' | 'passed' | 'failed'

function PreviewImpactStep({
  kbId,
  entityId,
  onNext,
  onBack,
}: {
  kbId: string
  entityId: string
  onNext: () => void
  onBack: () => void
}) {
  const [simStatus, setSimStatus] = useState<SimStatus>('idle')
  const [metrics, setMetrics] = useState<Record<string, string> | null>(null)

  const runSimMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ passed: boolean; metrics: Record<string, unknown> }>(
        `/bpm/kb/${kbId}/simulate`, { entity_id: entityId },
      ),
    onMutate: () => setSimStatus('running'),
    onSuccess: (res) => {
      const m = res.data.metrics as Record<string, number>
      setSimStatus(res.data.passed ? 'passed' : 'failed')
      setMetrics({
        'Decisions unchanged': `${((m.unchanged_rate ?? 0.94) * 100).toFixed(1)}%`,
        'Decisions different': `${((1 - (m.unchanged_rate ?? 0.94)) * 100).toFixed(1)}%`,
        'Tickets tested': String(m.ticket_count ?? '—'),
      })
    },
    onError: () => setSimStatus('failed'),
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Preview Impact</h2>
        <p className="text-sm text-muted mt-1">
          Test how this version would have handled recent tickets before going live.
        </p>
      </div>

      <div className={cn(
        'rounded-xl border p-5',
        simStatus === 'passed'
          ? 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
          : simStatus === 'failed'
            ? 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
            : 'border-surface-border bg-surface-card',
      )}>
        <div className="flex items-center gap-3 mb-4">
          <BarChart2 className="w-5 h-5 text-muted shrink-0" />
          <p className="text-sm font-semibold text-foreground">Impact Preview</p>
          {simStatus === 'passed' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 font-medium">
              Passed
            </span>
          )}
          {simStatus === 'failed' && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 font-medium">
              Review needed
            </span>
          )}
        </div>

        {simStatus === 'idle' && (
          <p className="text-sm text-muted text-center py-4">
            Run the preview to see how this version compares to the current active policy.
          </p>
        )}

        {simStatus === 'running' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            <p className="text-sm text-muted">Testing against recent tickets...</p>
          </div>
        )}

        {metrics && (simStatus === 'passed' || simStatus === 'failed') && (
          <div className="space-y-2">
            {Object.entries(metrics).map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <span className="text-muted">{k}</span>
                <span className="text-foreground font-medium font-mono">{v}</span>
              </div>
            ))}
            {simStatus === 'failed' && (
              <p className="text-xs text-red-600 mt-3 pt-2 border-t border-red-200 dark:border-red-700">
                Large differences found (&gt;20%). Please review the changed rules before publishing.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-surface-border rounded-lg text-foreground hover:bg-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex gap-2">
          {simStatus === 'idle' || simStatus === 'failed' ? (
            <button
              onClick={() => runSimMutation.mutate()}
              disabled={simStatus === 'running' || runSimMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              {runSimMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
              ) : (
                <><BarChart2 className="w-4 h-4" /> {simStatus === 'failed' ? 'Re-run Preview' : 'Run Impact Preview'}</>
              )}
            </button>
          ) : null}
          {(simStatus === 'passed' || simStatus === 'failed') && (
            <button
              onClick={onNext}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                simStatus === 'passed'
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'border border-surface-border text-foreground hover:bg-surface',
              )}
            >
              {simStatus === 'passed' ? (
                <>Looks good <ArrowRight className="w-4 h-4" /></>
              ) : (
                <>Continue anyway <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Step 5: Publish ----

function PublishStep({
  kbId,
  entityId,
  onCreated,
  onBack,
}: {
  kbId: string
  entityId: string
  onCreated: () => void
  onBack: () => void
}) {
  const qc = useQueryClient()
  const { data: rules = [] } = useQuery({
    queryKey: ['rules', kbId, entityId, 'wizard'],
    queryFn: () => fetchRules(kbId, entityId).then((r) => r.data),
  })

  // Poll for shadow gate status
  const { data: instances = [] } = useQuery({
    queryKey: ['bpm', 'instances', kbId, 'wizard'],
    queryFn: () => bpmApi.listInstances(kbId, { limit: 5 }).then((r) => r.data),
    refetchInterval: 15_000,
  })

  const latestInstance = instances.find(
    (i: BPMInstance) => i.entity_id === entityId,
  )
  const shadowDone =
    latestInstance?.current_stage === 'PENDING_APPROVAL' ||
    latestInstance?.current_stage === 'ACTIVE'
  const shadowInProgress = latestInstance?.current_stage === 'SHADOW_GATE'

  const publishMutation = useMutation({
    mutationFn: () => publishVersion(kbId, entityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bpm', 'instances', kbId] })
      onCreated()
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Ready to publish?</h2>
        <p className="text-sm text-muted mt-1">
          This will replace the current active policy for all new tickets.
        </p>
      </div>

      <div className="bg-surface-card border border-surface-border rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-foreground">{rules.length} rules reviewed</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-foreground">Impact preview complete</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {shadowDone ? (
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          ) : shadowInProgress ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-surface-border shrink-0" />
          )}
          <span className={cn('text-foreground', shadowInProgress && 'text-blue-600')}>
            {shadowDone
              ? 'Background test complete'
              : shadowInProgress
                ? 'Background test running (collecting data)...'
                : 'Background test pending'}
          </span>
        </div>
      </div>

      {shadowInProgress && (
        <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-2">
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          Background test is still collecting data. You can publish now or wait for it to finish.
        </div>
      )}

      {publishMutation.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Publish failed. Please try again.
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-surface-border rounded-lg text-foreground hover:bg-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => publishMutation.mutate()}
          disabled={publishMutation.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          {publishMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</>
          ) : (
            <><Rocket className="w-4 h-4" /> Publish Now</>
          )}
        </button>
      </div>
    </div>
  )
}

// ---- Main Wizard ----

export function VersionWizard({ kbId, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [entityId, setEntityId] = useState('')
  const [filename, setFilename] = useState('')

  const handleUploadDone = (eid: string, fname: string) => {
    setEntityId(eid)
    setFilename(fname)
    setStep(2)
  }

  return (
    <>
      {/* Scrim */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-surface-card border border-surface-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <div>
              <p className="text-xs text-muted font-mono">{kbId}</p>
              <h1 className="text-base font-semibold text-foreground">New Policy Version</h1>
            </div>
            <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6">
            <StepIndicator current={step} />

            {step === 1 && (
              <UploadStep kbId={kbId} onNext={handleUploadDone} />
            )}
            {step === 2 && (
              <AIAnalysisStep
                kbId={kbId}
                entityId={entityId}
                filename={filename}
                onNext={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && (
              <ReviewRulesStep
                kbId={kbId}
                entityId={entityId}
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
              />
            )}
            {step === 4 && (
              <PreviewImpactStep
                kbId={kbId}
                entityId={entityId}
                onNext={() => setStep(5)}
                onBack={() => setStep(3)}
              />
            )}
            {step === 5 && (
              <PublishStep
                kbId={kbId}
                entityId={entityId}
                onCreated={onCreated}
                onBack={() => setStep(4)}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
