import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { StatusPill } from '@/components/common/StatusPill'
import { VersionBadge } from '@/components/common/VersionBadge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { JsonViewer } from '@/components/common/JsonViewer'
import { kbApi } from '@/api/governance/kb.api'
import { simulationApi } from '@/api/governance/simulation.api'
import { shadowApi } from '@/api/governance/shadow.api'
import { toast } from '@/stores/toast.store'
import { useAuthStore } from '@/stores/auth.store'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/cn'
import { Shield, Play, Ghost, BookOpen } from 'lucide-react'

type Tab = 'versions' | 'simulation' | 'shadow'

export default function PolicyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('versions')
  const { role } = useAuthStore()
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
    { key: 'versions' as const, label: 'Versions', icon: BookOpen },
    { key: 'simulation' as const, label: 'Simulation', icon: Play },
    { key: 'shadow' as const, label: 'Shadow Policy', icon: Ghost },
  ]

  return (
    <div>
      <PageHeader
        title="Policy Management"
        subtitle="Compare policy versions, run simulations, and manage shadow testing"
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

      {activeTab === 'versions' && (
        <PolicyVersionsPanel versions={versions} activeVersion={activeVersion?.active_version} />
      )}
      {activeTab === 'simulation' && (
        <SimulationPanel versions={versions?.map((v) => v.version_label) ?? []} canEdit={role !== 'viewer'} />
      )}
      {activeTab === 'shadow' && (
        <ShadowPolicyPanel canPublish={canPublish} />
      )}
    </div>
  )
}

function PolicyVersionsPanel({ versions, activeVersion }: {
  versions?: Array<{ id: number; version_label: string; status: string; created_by: string | null; created_at: string }>
  activeVersion?: string
}) {
  const [viewingVersion, setViewingVersion] = useState<string | null>(null)

  const { data: snapshot } = useQuery({
    queryKey: ['kb', 'version', viewingVersion],
    queryFn: () => kbApi.getVersion(viewingVersion!).then((r) => r.data),
    enabled: viewingVersion != null,
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Policy Versions</CardTitle></CardHeader>
          <CardContent className="p-0">
            {!versions?.length ? (
              <EmptyState title="No versions" />
            ) : (
              <div className="divide-y divide-surface-border">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-4 px-4 py-3">
                    <VersionBadge version={v.version_label} isActive={v.version_label === activeVersion} />
                    <StatusPill status={v.status} />
                    <span className="text-xs text-subtle flex-1">{v.created_by ?? '—'}</span>
                    <span className="text-xs text-subtle">{formatDate(v.created_at)}</span>
                    <Button variant="ghost" size="xs" onClick={() => setViewingVersion(v.version_label)}>View Snapshot</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        {viewingVersion && snapshot ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Snapshot: {viewingVersion}</CardTitle>
                <Button variant="ghost" size="xs" onClick={() => setViewingVersion(null)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent>
              <JsonViewer data={snapshot} expanded={false} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <EmptyState icon={<Shield className="w-8 h-8 text-subtle" />} title="Select a version" description="Click 'View Snapshot' to inspect a version's content." />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function SimulationPanel({ versions, canEdit }: { versions: string[]; canEdit: boolean }) {
  const [baseline, setBaseline] = useState('')
  const [candidate, setCandidate] = useState('')
  const [simResult, setSimResult] = useState<object | null>(null)
  const [loading, setLoading] = useState(false)

  const versionOptions = versions.map((v) => ({ value: v, label: v }))

  const handleRun = async () => {
    if (!baseline || !candidate) return
    setLoading(true)
    try {
      const res = await simulationApi.run({ baseline_version: baseline, candidate_version: candidate })
      setSimResult(res.data as object)
      toast.success('Simulation complete')
    } catch {
      toast.error('Simulation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Run Policy Simulation</CardTitle></CardHeader>
        <CardContent>
          {!canEdit ? (
            <p className="text-sm text-muted">Editor or Publisher role required to run simulations.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted mb-1 block">Baseline Version</label>
                  <select
                    className="w-full bg-surface border border-surface-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                    value={baseline}
                    onChange={(e) => setBaseline(e.target.value)}
                  >
                    <option value="">Select baseline…</option>
                    {versionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Candidate Version</label>
                  <select
                    className="w-full bg-surface border border-surface-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                    value={candidate}
                    onChange={(e) => setCandidate(e.target.value)}
                  >
                    <option value="">Select candidate…</option>
                    {versionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <Button onClick={handleRun} loading={loading} disabled={!baseline || !candidate || baseline === candidate} className="w-full">
                <Play className="w-4 h-4" />Run Simulation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {simResult && (
        <Card>
          <CardHeader><CardTitle>Simulation Results</CardTitle></CardHeader>
          <CardContent>
            <JsonViewer data={simResult} expanded />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ShadowPolicyPanel({ canPublish }: { canPublish: boolean }) {
  const [shadowVersion, setShadowVersion] = useState('')
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)

  const { data: stats, refetch } = useQuery({
    queryKey: ['shadow', 'stats'],
    queryFn: () => shadowApi.getStats().then((r) => r.data),
    refetchInterval: 15_000,
    retry: false,
  })

  const enableMut = useMutation({
    mutationFn: (v: string) => shadowApi.enable({ shadow_version: v }),
    onSuccess: () => { toast.success('Shadow policy enabled'); void refetch() },
    onError: () => toast.error('Failed to enable shadow'),
  })

  const disableMut = useMutation({
    mutationFn: () => shadowApi.disable(),
    onSuccess: () => { toast.success('Shadow policy disabled'); setShowDisableConfirm(false); void refetch() },
    onError: () => toast.error('Failed to disable shadow'),
  })

  const isActive = stats?.is_active ?? false

  return (
    <div className="space-y-4">
      {/* Status Hero */}
      <Card className={cn('border-2', isActive ? 'border-amber-700/50 bg-amber-900/10' : 'border-surface-border')}>
        <CardContent className="py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Ghost className="w-5 h-5 text-amber-400" />
                <span className="font-semibold text-foreground">Shadow Policy</span>
                <Badge variant={isActive ? 'amber' : 'gray'}>{isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
              {isActive && stats && (
                <div className="flex gap-6 mt-2 text-sm">
                  <div>
                    <span className="text-muted">Shadow: </span>
                    {stats.shadow_version && <VersionBadge version={stats.shadow_version} isShadow />}
                  </div>
                  <div>
                    <span className="text-muted">vs Active: </span>
                    {stats.active_version && <VersionBadge version={stats.active_version} isActive />}
                  </div>
                </div>
              )}
            </div>
            {canPublish && isActive && (
              <Button variant="danger" size="sm" onClick={() => setShowDisableConfirm(true)} loading={disableMut.isPending}>
                Disable Shadow
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {isActive && stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Tickets Evaluated', value: stats.total_evaluated.toLocaleString() },
            { label: 'Decisions Changed', value: stats.decisions_changed.toLocaleString(), highlight: stats.decisions_changed > 0 },
            { label: 'Change Rate', value: `${(stats.change_rate * 100).toFixed(1)}%`, highlight: stats.change_rate > 0.05 },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="py-3 text-center">
                <p className="text-xs text-subtle">{s.label}</p>
                <p className={cn('text-2xl font-bold mt-1', s.highlight ? 'text-amber-300' : 'text-foreground')}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Enable Form */}
      {!isActive && canPublish && (
        <Card>
          <CardHeader><CardTitle>Enable Shadow Policy</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input placeholder="Shadow version label" value={shadowVersion} onChange={(e) => setShadowVersion(e.target.value)} />
              <Button onClick={() => shadowVersion && enableMut.mutate(shadowVersion)} loading={enableMut.isPending} disabled={!shadowVersion}>
                <Ghost className="w-4 h-4" />Enable
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!canPublish && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Publisher role required to enable/disable shadow policy.</p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={showDisableConfirm}
        onClose={() => setShowDisableConfirm(false)}
        onConfirm={() => disableMut.mutate()}
        title="Disable Shadow Policy?"
        description="This will stop shadow evaluation. The active policy will continue serving all requests."
        confirmLabel="Disable"
        loading={disableMut.isPending}
      />
    </div>
  )
}
