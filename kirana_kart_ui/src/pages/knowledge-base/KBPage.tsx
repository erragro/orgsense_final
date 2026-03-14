import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { StatusPill } from '@/components/common/StatusPill'
import { VersionBadge } from '@/components/common/VersionBadge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { kbApi } from '@/api/governance/kb.api'
import { compilerApi } from '@/api/governance/compiler.api'
import { vectorizationApi } from '@/api/governance/vectorization.api'
import { toast } from '@/stores/toast.store'
import { useAuthStore } from '@/stores/auth.store'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { KB_FORMATS, type KBFormat } from '@/lib/constants'
import { Upload, BookOpen, Code2 } from 'lucide-react'

type Tab = 'uploads' | 'versions' | 'compiler'

export default function KBPage() {
  const [activeTab, setActiveTab] = useState<Tab>('uploads')
  const { role } = useAuthStore()
  const canEdit = role === 'editor' || role === 'publisher'
  const canPublish = role === 'publisher'

  const { data: versions } = useQuery({
    queryKey: ['kb', 'versions'],
    queryFn: () => kbApi.getVersions().then((r) => r.data),
  })

  const { data: activeVersion } = useQuery({
    queryKey: ['kb', 'active-version'],
    queryFn: () => kbApi.getActiveVersion().then((r) => r.data),
  })

  const TABS = [
    { key: 'uploads' as const, label: 'Uploads', icon: Upload },
    { key: 'versions' as const, label: 'Versions', icon: BookOpen },
    { key: 'compiler' as const, label: 'Compiler', icon: Code2 },
  ]

  return (
    <div>
      <PageHeader
        title="Knowledge Base"
        subtitle="Upload, compile, and manage knowledge base documents"
        actions={activeVersion && <VersionBadge version={activeVersion.active_version} isActive />}
      />

      <div className="flex gap-1 mb-4 border-b border-surface-border">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.key ? 'border-brand-500 text-brand-400' : 'border-transparent text-muted hover:text-foreground')}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'uploads' && <KBUploadPanel canEdit={canEdit} />}
      {activeTab === 'versions' && (
        <KBVersionsPanel versions={versions} activeVersion={activeVersion?.active_version} canPublish={canPublish} />
      )}
      {activeTab === 'compiler' && <KBCompilerPanel canPublish={canPublish} />}
    </div>
  )
}

function KBUploadPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const [docId, setDocId] = useState('')
  const [filename, setFilename] = useState('')
  const [format, setFormat] = useState<KBFormat>('markdown')
  const [versionLabel, setVersionLabel] = useState('draft')
  const [uploadedBy, setUploadedBy] = useState('')
  const [rawContent, setRawContent] = useState('')
  const [loading, setLoading] = useState(false)

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => setRawContent(ev.target?.result as string)
    reader.readAsText(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!docId || !rawContent) return
    setLoading(true)
    try {
      await kbApi.upload({ document_id: docId, original_filename: filename, original_format: format, raw_content: rawContent, uploaded_by: uploadedBy, version_label: versionLabel })
      toast.success('Document uploaded', `${docId} uploaded successfully`)
      void qc.invalidateQueries({ queryKey: ['kb'] })
      setRawContent('')
      setDocId('')
    } catch {
      toast.error('Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Upload KB Document</CardTitle></CardHeader>
        <CardContent>
          {!canEdit ? (
            <p className="text-sm text-muted">Editor or Publisher role required to upload documents.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <Input label="Document ID *" placeholder="delivery-policy-v2" value={docId} onChange={(e) => setDocId(e.target.value)} required />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Format"
                  options={KB_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))}
                  value={format}
                  onChange={(e) => setFormat(e.target.value as KBFormat)}
                />
                <Input label="Version Label" placeholder="draft" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
              </div>
              <Input label="Uploaded By" placeholder="admin@company.com" value={uploadedBy} onChange={(e) => setUploadedBy(e.target.value)} />

              <div>
                <label className="text-xs font-medium text-muted">Load from file</label>
                <input type="file" accept=".md,.txt,.json,.pdf,.docx" onChange={handleFileLoad}
                  className="mt-1 block w-full text-xs text-muted file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-surface-card file:text-foreground hover:file:bg-surface" />
                {filename && <p className="text-xs text-subtle mt-0.5">Loaded: {filename}</p>}
              </div>

              <Textarea
                label="Raw Content *"
                placeholder="Paste document content here or load from file above..."
                className="min-h-[200px] font-mono text-xs"
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                required
              />

              <Button type="submit" loading={loading} className="w-full" disabled={!docId || !rawContent}>
                <Upload className="w-4 h-4" />Upload Document
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Uploads</CardTitle></CardHeader>
        <CardContent>
          <EmptyState
            title="No uploads visible"
            description="Uploaded documents will appear here once the GET /kb/uploads endpoint is available."
          />
        </CardContent>
      </Card>
    </div>
  )
}

function KBVersionsPanel({ versions, activeVersion, canPublish }: {
  versions?: Array<{ id: number; version_label: string; status: string; created_by: string | null; created_at: string }>
  activeVersion?: string
  canPublish: boolean
}) {
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null)
  const qc = useQueryClient()

  const rollbackMut = useMutation({
    mutationFn: (v: string) => kbApi.rollback(v),
    onSuccess: () => {
      toast.success('KB rolled back')
      setRollbackTarget(null)
      void qc.invalidateQueries({ queryKey: ['kb'] })
    },
    onError: () => toast.error('Rollback failed'),
  })

  const vectorizeMut = useMutation({
    mutationFn: (v: string) => vectorizationApi.vectorizeVersion(v),
    onSuccess: (_, v) => toast.success('Vectorization queued', `Version ${v}`),
    onError: () => toast.error('Vectorization failed'),
  })

  return (
    <>
      <Card>
        <CardHeader><CardTitle>KB Versions</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!versions?.length ? (
            <EmptyState title="No published versions" />
          ) : (
            <div className="divide-y divide-surface-border">
              {versions.map((v) => (
                <div key={v.id} className="flex items-center gap-4 px-4 py-3">
                  <VersionBadge version={v.version_label} isActive={v.version_label === activeVersion} />
                  <StatusPill status={v.status} />
                  <span className="text-xs text-subtle flex-1">{v.created_by ?? '—'}</span>
                  <span className="text-xs text-subtle">{formatDate(v.created_at)}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="xs" onClick={() => vectorizeMut.mutate(v.version_label)} loading={vectorizeMut.isPending}>Vectorize</Button>
                    {canPublish && v.version_label !== activeVersion && (
                      <Button variant="ghost" size="xs" onClick={() => setRollbackTarget(v.version_label)}>Rollback</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={rollbackTarget != null}
        onClose={() => setRollbackTarget(null)}
        onConfirm={() => rollbackTarget && rollbackMut.mutate(rollbackTarget)}
        title={`Rollback KB to ${rollbackTarget}?`}
        description="This will revert the active knowledge base to the selected version."
        confirmLabel="Rollback"
        loading={rollbackMut.isPending}
      />
    </>
  )
}

function KBCompilerPanel({ canPublish }: { canPublish: boolean }) {
  const [versionInput, setVersionInput] = useState('')
  const [statusVersion, setStatusVersion] = useState('')
  const [compilerStatus, setCompilerStatus] = useState<object | null>(null)
  const [vectorStatus, setVectorStatus] = useState<object | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)

  const handleCompileLatest = async () => {
    setCompiling(true)
    try {
      const res = await compilerApi.compileLatest()
      toast.success('Compilation started', JSON.stringify(res.data))
    } catch {
      toast.error('Compilation failed')
    } finally {
      setCompiling(false)
    }
  }

  const handleCompileVersion = async () => {
    if (!versionInput) return
    setCompiling(true)
    try {
      await compilerApi.compileVersion(versionInput)
      toast.success('Compilation started', `Version: ${versionInput}`)
    } catch {
      toast.error('Compilation failed')
    } finally {
      setCompiling(false)
    }
  }

  const handleCheckStatus = async () => {
    if (!statusVersion) return
    setCheckingStatus(true)
    try {
      const [cs, vs] = await Promise.all([
        compilerApi.getStatus(statusVersion).then((r) => r.data),
        vectorizationApi.getStatus(statusVersion).then((r) => r.data),
      ])
      setCompilerStatus(cs as object)
      setVectorStatus(vs as object)
    } catch {
      toast.error('Failed to get status')
    } finally {
      setCheckingStatus(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Compile KB</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!canPublish ? (
            <p className="text-sm text-muted">Publisher role required to compile.</p>
          ) : (
            <>
              <div>
                <p className="text-xs text-subtle mb-2">Compile the most recent draft</p>
                <Button onClick={handleCompileLatest} loading={compiling} className="w-full">
                  <Code2 className="w-4 h-4" />Compile Latest Draft
                </Button>
              </div>
              <div className="border-t border-surface-border pt-4">
                <p className="text-xs text-subtle mb-2">Compile a specific version</p>
                <div className="flex gap-2">
                  <Input placeholder="Version label" value={versionInput} onChange={(e) => setVersionInput(e.target.value)} />
                  <Button onClick={handleCompileVersion} loading={compiling} disabled={!versionInput} variant="secondary">Go</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Check Status</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Version label" value={statusVersion} onChange={(e) => setStatusVersion(e.target.value)} />
            <Button onClick={handleCheckStatus} loading={checkingStatus} disabled={!statusVersion} variant="secondary">Check</Button>
          </div>
          {compilerStatus && (
            <div>
              <p className="text-xs text-subtle mb-1">Compiler Status</p>
              <pre className="text-xs font-mono bg-surface rounded p-2 overflow-auto text-foreground">
                {JSON.stringify(compilerStatus, null, 2)}
              </pre>
            </div>
          )}
          {vectorStatus && (
            <div>
              <p className="text-xs text-subtle mb-1">Vector Job Status</p>
              <pre className="text-xs font-mono bg-surface rounded p-2 overflow-auto text-foreground">
                {JSON.stringify(vectorStatus, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
