import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { kbApi } from '@/api/governance/kb.api'
import { compilerApi } from '@/api/governance/compiler.api'
import { vectorizationApi } from '@/api/governance/vectorization.api'
import { toast } from '@/stores/toast.store'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/cn'
import { CheckCircle2, Circle, Loader2 } from 'lucide-react'

interface Props {
  canAdmin: boolean
}

type StepStatus = 'idle' | 'running' | 'done' | 'error'

export function PipelineTab({ canAdmin }: Props) {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  // selected document / version
  const [selectedDoc, setSelectedDoc] = useState('')
  const [versionLabel, setVersionLabel] = useState('')

  // step states
  const [extractStatus, setExtractStatus] = useState<StepStatus>('idle')
  const [extractMsg, setExtractMsg] = useState('')
  const [compileStatus, setCompileStatus] = useState<StepStatus>('idle')
  const [vectorStatus, setVectorStatus] = useState<StepStatus>('idle')
  const [publishConfirm, setPublishConfirm] = useState(false)
  const [publishStatus, setPublishStatus] = useState<StepStatus>('idle')

  const { data: uploads } = useQuery({
    queryKey: ['kb', 'uploads'],
    queryFn: () => kbApi.getUploads().then((r) => r.data),
  })

  const { data: activeVersion } = useQuery({
    queryKey: ['kb', 'active-version'],
    queryFn: () => kbApi.getActiveVersion().then((r) => r.data),
  })

  // Fetch compiler status whenever a version is selected (not just after clicking Compile)
  const { data: compilerStatusData } = useQuery({
    queryKey: ['compiler', 'status', versionLabel],
    queryFn: () => compilerApi.getStatus(versionLabel).then((r) => r.data),
    enabled: !!versionLabel,
    refetchInterval: compileStatus === 'running' ? 3000 : false,
    retry: false, // 404 = not compiled yet, don't spam retries
  })

  // Fetch vector status whenever a version is selected
  const { data: vectorStatusData } = useQuery({
    queryKey: ['vector', 'status', versionLabel],
    queryFn: () => vectorizationApi.getStatus(versionLabel).then((r) => r.data),
    enabled: !!versionLabel,
    refetchInterval: vectorStatus === 'running' ? 3000 : false,
    retry: false,
  })

  // Include draft AND compiled docs so users can continue vectorize/publish after compile
  const draftDocs = uploads?.filter((u) => u.registry_status === 'draft' || u.registry_status === 'compiled') ?? []

  const handleExtract = async () => {
    if (!versionLabel) { toast.error('Enter a version label first'); return }
    setExtractStatus('running')
    setExtractMsg('')
    try {
      const res = await compilerApi.extractActions(versionLabel)
      const { inserted_count, total_count } = res.data
      setExtractMsg(`${inserted_count} new codes inserted (${total_count} total)`)
      setExtractStatus('done')
      void qc.invalidateQueries({ queryKey: ['compiler', 'action-codes'] })
    } catch {
      setExtractStatus('error')
      toast.error('Action extraction failed')
    }
  }

  const handleCompile = async () => {
    if (!versionLabel) { toast.error('Enter a version label first'); return }
    setCompileStatus('running')
    try {
      await compilerApi.compileVersion(versionLabel)
      setCompileStatus('done')
      void qc.invalidateQueries({ queryKey: ['compiler', 'status', versionLabel] })
    } catch {
      setCompileStatus('error')
      toast.error('Compilation failed')
    }
  }

  const handleVectorize = async () => {
    if (!versionLabel) return
    setVectorStatus('running')
    try {
      await vectorizationApi.vectorizeVersion(versionLabel)
      setVectorStatus('done')
      toast.success('Vectorization queued', versionLabel)
      void qc.invalidateQueries({ queryKey: ['vector', 'status', versionLabel] })
    } catch {
      setVectorStatus('error')
      toast.error('Vectorization failed')
    }
  }

  const handlePublish = async () => {
    if (!versionLabel || !user) return
    setPublishStatus('running')
    setPublishConfirm(false)
    try {
      await kbApi.publish(versionLabel, user.email)
      setPublishStatus('done')
      toast.success('Version published', `${versionLabel} is now live`)
      void qc.invalidateQueries({ queryKey: ['kb'] })
    } catch {
      setPublishStatus('error')
      toast.error('Publish failed')
    }
  }

  // Backend returns { vector_status: 'completed' }, not { status: 'completed' }
  const vecDone =
    vectorStatus === 'done' ||
    (vectorStatusData as any)?.vector_status === 'completed' ||
    compilerStatusData?.is_active

  const steps = [
    {
      num: 1,
      title: 'Select Document & Version',
      description: 'Choose the uploaded document and assign a version label.',
      content: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <Select
            label="Document"
            options={[
              { value: '', label: 'Select draft…' },
              ...draftDocs.map((d) => ({
                value: d.version_label,
                label: `${d.document_id} (${d.version_label})`,
              })),
            ]}
            value={selectedDoc}
            onChange={(e) => {
              setSelectedDoc(e.target.value)
              setVersionLabel(e.target.value)
            }}
          />
          <Input
            label="Version Label"
            placeholder="e.g. draft"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
          />
        </div>
      ),
      status: versionLabel ? 'done' : 'idle',
      disabled: false,
    },
    {
      num: 2,
      title: 'Extract Action Codes',
      description: 'Run LLM over the document to identify all possible decision outcomes.',
      content: canAdmin && (
        <div className="mt-2 flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExtract}
            loading={extractStatus === 'running'}
            disabled={!versionLabel}
          >
            Extract Actions
          </Button>
          {extractMsg && <span className="text-xs text-green-400">{extractMsg}</span>}
          {extractStatus === 'error' && <span className="text-xs text-red-400">Failed</span>}
        </div>
      ),
      status: extractStatus,
      disabled: !versionLabel,
    },
    {
      num: 3,
      title: 'Compile',
      description: 'Convert document to structured rules via LLM.',
      content: canAdmin && (
        <div className="mt-2 flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCompile}
            loading={compileStatus === 'running'}
            disabled={!versionLabel}
          >
            Compile Now
          </Button>
          {compilerStatusData && (
            <span className="text-xs text-green-400">
              {compilerStatusData.artifact_hash ? 'compiled ✓' : 'pending'}
            </span>
          )}
        </div>
      ),
      // Backend truth takes precedence: if compiled, show done regardless of local error state
      status: compilerStatusData?.artifact_hash
        ? 'done'
        : compileStatus === 'running' ? 'running' : compileStatus,
      disabled: !versionLabel,
    },
    {
      num: 4,
      title: 'Vectorize',
      description: 'Embed rules into Weaviate for semantic retrieval.',
      content: canAdmin && (
        <div className="mt-2 flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleVectorize}
            loading={vectorStatus === 'running'}
            disabled={!versionLabel}
          >
            Vectorize Now
          </Button>
          {vectorStatusData && (
            <span className={cn(
              'text-xs',
              (vectorStatusData as any).vector_status === 'completed' ? 'text-green-400' :
              (vectorStatusData as any).vector_status === 'failed' ? 'text-red-400' : 'text-amber-400'
            )}>
              {(vectorStatusData as any).vector_status ?? vectorStatusData.status}
            </span>
          )}
        </div>
      ),
      // Backend truth: if vectorization already completed, show done even if not clicked this session
      status: (vectorStatusData as any)?.vector_status === 'completed'
        ? 'done'
        : (vectorStatusData as any)?.vector_status === 'failed'
        ? 'error'
        : vectorStatus === 'running' ? 'running' : vectorStatus,
      disabled: !versionLabel,
    },
    {
      num: 5,
      title: 'Publish',
      description: 'Set this version as live for ticket evaluation.',
      content: canAdmin && (
        <div className="mt-2 flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setPublishConfirm(true)}
            loading={publishStatus === 'running'}
            disabled={!versionLabel || !vecDone}
          >
            Publish Version
          </Button>
          {!vecDone && versionLabel && (
            <span className="text-xs text-subtle">Complete vectorization first</span>
          )}
          {publishStatus === 'done' && <span className="text-xs text-green-400">Published ✓</span>}
        </div>
      ),
      status: publishStatus,
      disabled: !vecDone,
    },
  ]

  return (
    <div className="space-y-4">
      {activeVersion && (
        <div className="flex items-center gap-2 text-sm text-subtle">
          Current active version:
          <span className="font-mono text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded">
            {activeVersion.active_version}
          </span>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Pipeline Workflow</CardTitle></CardHeader>
        <CardContent className="divide-y divide-surface-border">
          {steps.map((step) => (
            <div key={step.num} className={cn('py-4', step.disabled && 'opacity-50')}>
              <div className="flex items-start gap-3">
                <StepIcon status={step.status as StepStatus} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-subtle">STEP {step.num}</span>
                    <span className="text-sm font-medium text-foreground">{step.title}</span>
                  </div>
                  <p className="text-xs text-subtle mt-0.5">{step.description}</p>
                  {step.content}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={publishConfirm}
        onClose={() => setPublishConfirm(false)}
        onConfirm={handlePublish}
        title={`Publish version "${versionLabel}"?`}
        description="This will set the selected version as live. All new ticket evaluations will use this policy."
        confirmLabel="Publish"
      />
    </div>
  )
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <Loader2 className="w-5 h-5 text-brand-400 animate-spin mt-0.5" />
  if (status === 'done') return <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
  if (status === 'error') return <CheckCircle2 className="w-5 h-5 text-red-400 mt-0.5" />
  return <Circle className="w-5 h-5 text-subtle mt-0.5" />
}
