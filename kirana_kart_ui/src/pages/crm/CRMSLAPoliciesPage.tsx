import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Save, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { crmApi } from '@/api/governance/crm.api'
import { useAuthStore } from '@/stores/auth.store'
import { hasPermission } from '@/lib/access'
import type { SLAPolicy } from '@/types/crm.types'

const QUEUE_LABELS: Record<string, string> = {
  ESCALATION_QUEUE: 'Escalation Queue',
  SLA_BREACH_REVIEW: 'SLA Breach Review',
  SENIOR_REVIEW: 'Senior Review',
  MANUAL_REVIEW: 'Manual Review',
  STANDARD_REVIEW: 'Standard Review',
}

const QUEUE_DESCRIPTIONS: Record<string, string> = {
  ESCALATION_QUEUE: 'High-priority escalated cases requiring immediate attention',
  SLA_BREACH_REVIEW: 'Tickets that have already breached SLA and need urgent handling',
  SENIOR_REVIEW: 'Complex cases requiring senior agent review — high-refund or suspicious fraud',
  MANUAL_REVIEW: 'Cases where automation pathway could not be determined — full human review',
  STANDARD_REVIEW: 'Routine HITL cases within normal policy parameters',
}

const QUEUE_ORDER = [
  'ESCALATION_QUEUE',
  'SLA_BREACH_REVIEW',
  'SENIOR_REVIEW',
  'MANUAL_REVIEW',
  'STANDARD_REVIEW',
]

function minutesToDisplay(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function SLABar({ minutes, maxMinutes }: { minutes: number; maxMinutes: number }) {
  const pct = Math.min((minutes / maxMinutes) * 100, 100)
  const color = pct < 30 ? 'bg-green-500' : pct < 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="w-full bg-surface-2 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function PolicyRow({
  policy,
  canAdmin,
  onSave,
}: {
  policy: SLAPolicy
  canAdmin: boolean
  onSave: (qt: string, res: number, fr: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [res, setRes] = useState(policy.resolution_minutes)
  const [fr, setFr] = useState(policy.first_response_minutes)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(policy.queue_type, res, fr)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const maxRes = 480  // STANDARD_REVIEW is the max at 480min

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-text">{QUEUE_LABELS[policy.queue_type] || policy.queue_type}</h3>
          <p className="text-xs text-text-muted mt-0.5">{QUEUE_DESCRIPTIONS[policy.queue_type]}</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {canAdmin && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-brand hover:underline"
            >
              Edit
            </button>
          )}
          {editing && (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1 bg-brand text-white rounded-lg text-xs font-medium disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setRes(policy.resolution_minutes); setFr(policy.first_response_minutes) }}
                className="px-3 py-1 text-xs text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Resolution SLA */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">Resolution SLA</span>
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-20 bg-surface-2 border border-border rounded-lg px-2 py-1 text-sm text-text"
                value={res}
                onChange={e => setRes(parseInt(e.target.value) || 1)}
                min={1}
                max={2880}
              />
              <span className="text-xs text-text-muted">minutes</span>
              <span className="text-xs text-text-muted">({minutesToDisplay(res)})</span>
            </div>
          ) : (
            <div>
              <p className="text-xl font-bold text-text">{minutesToDisplay(policy.resolution_minutes)}</p>
              <SLABar minutes={policy.resolution_minutes} maxMinutes={maxRes} />
            </div>
          )}
        </div>

        {/* First Response SLA */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">First Response SLA</span>
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-20 bg-surface-2 border border-border rounded-lg px-2 py-1 text-sm text-text"
                value={fr}
                onChange={e => setFr(parseInt(e.target.value) || 1)}
                min={1}
                max={480}
              />
              <span className="text-xs text-text-muted">minutes</span>
              <span className="text-xs text-text-muted">({minutesToDisplay(fr)})</span>
            </div>
          ) : (
            <div>
              <p className="text-xl font-bold text-text">{minutesToDisplay(policy.first_response_minutes)}</p>
              <SLABar minutes={policy.first_response_minutes} maxMinutes={60} />
            </div>
          )}
        </div>
      </div>

      {policy.updated_at && policy.updated_by_name && (
        <p className="text-xs text-text-muted mt-3 pt-3 border-t border-border">
          Last updated {new Date(policy.updated_at).toLocaleDateString('en-IN', {
            month: 'short', day: 'numeric', year: 'numeric',
          })} by {policy.updated_by_name}
        </p>
      )}
    </div>
  )
}

export default function CRMSLAPoliciesPage() {
  const { user } = useAuthStore()
  const canAdmin = hasPermission(user, 'crm', 'admin')
  const qc = useQueryClient()

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['crm-sla-policies'],
    queryFn: () => crmApi.slaPolicies.list().then(r => r.data as SLAPolicy[]),
  })

  const updateMutation = useMutation({
    mutationFn: ({ queue_type, resolution_minutes, first_response_minutes }: {
      queue_type: string; resolution_minutes: number; first_response_minutes: number
    }) => crmApi.slaPolicies.update(queue_type, { resolution_minutes, first_response_minutes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-sla-policies'] }),
  })

  // Sort by QUEUE_ORDER
  const sorted = [...policies].sort((a, b) =>
    QUEUE_ORDER.indexOf(a.queue_type) - QUEUE_ORDER.indexOf(b.queue_type)
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text flex items-center gap-2">
            <Clock className="w-5 h-5 text-brand" /> SLA Policies
          </h1>
          <p className="text-sm text-text-muted mt-1">Configure resolution and first-response SLA targets per queue type</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 mb-5 flex items-start gap-3">
        <Info className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
        <div className="text-xs text-text-muted">
          <p>SLA changes take effect immediately for new tickets. Existing tickets keep their original SLA timestamps.</p>
          <p className="mt-1">Automation rules can fire <strong className="text-text">SLA_WARNING</strong> (15 min before breach) and <strong className="text-text">SLA_BREACHED</strong> triggers based on these thresholds.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-32 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((policy: SLAPolicy) => (
            <PolicyRow
              key={policy.queue_type}
              policy={policy}
              canAdmin={canAdmin}
              onSave={async (qt, res, fr) => {
                await updateMutation.mutateAsync({
                  queue_type: qt,
                  resolution_minutes: res,
                  first_response_minutes: fr,
                })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
