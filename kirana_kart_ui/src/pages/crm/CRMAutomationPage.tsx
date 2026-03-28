import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Zap, Plus, Play, Pause, Trash2, Eye, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, X, ArrowRight, ToggleLeft, ToggleRight,
  Sparkles,
} from 'lucide-react'
import { crmApi } from '@/api/governance/crm.api'
import { useAuthStore } from '@/stores/auth.store'
import type { AutomationRule, RuleCondition, RuleAction } from '@/types/crm.types'

const TRIGGER_COLORS: Record<string, string> = {
  TICKET_CREATED: 'bg-green-500/10 text-green-400 border-green-500/20',
  TICKET_UPDATED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  SLA_WARNING:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  SLA_BREACHED:   'bg-red-500/10 text-red-400 border-red-500/20',
}

const TRIGGER_LABELS: Record<string, string> = {
  TICKET_CREATED: 'Ticket Created',
  TICKET_UPDATED: 'Ticket Updated',
  SLA_WARNING:    'SLA Warning',
  SLA_BREACHED:   'SLA Breached',
}

const ACTION_LABELS: Record<string, string> = {
  assign_to_group:  'Assign to Group',
  assign_to_agent:  'Assign to Agent',
  change_priority:  'Change Priority',
  change_queue_type:'Change Queue Type',
  add_tag:          'Add Tag',
  change_status:    'Change Status',
  send_notification:'Send Notification',
  escalate:         'Escalate',
}

const PRIORITY_LABELS: Record<string, string> = { '1': 'Critical', '2': 'High', '3': 'Normal', '4': 'Low' }

function ConditionRow({
  condition,
  onChange,
  onRemove,
  schema,
}: {
  condition: RuleCondition
  onChange: (c: RuleCondition) => void
  onRemove: () => void
  schema: any
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        className="flex-1 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-text"
        value={condition.field}
        onChange={e => onChange({ ...condition, field: e.target.value })}
      >
        <option value="">Field...</option>
        {(schema?.fields || []).map((f: any) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
      <select
        className="w-28 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-text"
        value={condition.operator}
        onChange={e => onChange({ ...condition, operator: e.target.value })}
      >
        <option value="">Op...</option>
        {(schema?.operators || []).map((o: any) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      <input
        className="flex-1 bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-xs text-text"
        placeholder="Value"
        value={condition.value}
        onChange={e => onChange({ ...condition, value: e.target.value })}
      />
      <button onClick={onRemove} className="text-red-400 hover:text-red-300 p-1 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function ActionRow({
  action,
  onChange,
  onRemove,
  schema,
}: {
  action: RuleAction
  onChange: (a: RuleAction) => void
  onRemove: () => void
  schema: any
}) {
  const paramLabel = (k: string) =>
    k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="bg-surface-2 rounded-lg p-3 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <select
          className="flex-1 bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          value={action.action_type}
          onChange={e => onChange({ ...action, action_type: e.target.value, params: {} })}
        >
          <option value="">Action type...</option>
          {(schema?.action_types || []).map((a: any) => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300 p-1 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Dynamic param inputs */}
      {action.action_type === 'change_priority' && (
        <select
          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          value={action.params.priority || ''}
          onChange={e => onChange({ ...action, params: { priority: parseInt(e.target.value) } })}
        >
          <option value="">Select priority...</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      {action.action_type === 'change_queue_type' && (
        <select
          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          value={action.params.queue_type || ''}
          onChange={e => onChange({ ...action, params: { queue_type: e.target.value } })}
        >
          <option value="">Select queue...</option>
          {['STANDARD_REVIEW', 'SENIOR_REVIEW', 'SLA_BREACH_REVIEW', 'ESCALATION_QUEUE', 'MANUAL_REVIEW'].map(q => (
            <option key={q} value={q}>{q.replace(/_/g, ' ')}</option>
          ))}
        </select>
      )}
      {action.action_type === 'change_status' && (
        <select
          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          value={action.params.status || ''}
          onChange={e => onChange({ ...action, params: { status: e.target.value } })}
        >
          <option value="">Select status...</option>
          {['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'ESCALATED'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      )}
      {action.action_type === 'add_tag' && (
        <div className="flex gap-2">
          <input
            className="flex-1 bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
            placeholder="Tag name"
            value={action.params.tag_name || ''}
            onChange={e => onChange({ ...action, params: { ...action.params, tag_name: e.target.value } })}
          />
          <input
            type="color"
            className="w-8 h-7 rounded border border-border bg-surface cursor-pointer"
            value={action.params.tag_color || '#6B7280'}
            onChange={e => onChange({ ...action, params: { ...action.params, tag_color: e.target.value } })}
          />
        </div>
      )}
      {action.action_type === 'assign_to_group' && (
        <input
          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          placeholder="Group ID"
          type="number"
          value={action.params.group_id || ''}
          onChange={e => onChange({ ...action, params: { group_id: parseInt(e.target.value) } })}
        />
      )}
      {action.action_type === 'assign_to_agent' && (
        <input
          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          placeholder="Agent ID"
          type="number"
          value={action.params.agent_id || ''}
          onChange={e => onChange({ ...action, params: { agent_id: parseInt(e.target.value) } })}
        />
      )}
      {action.action_type === 'send_notification' && (
        <input
          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          placeholder="Notification message"
          value={action.params.message || ''}
          onChange={e => onChange({ ...action, params: { message: e.target.value } })}
        />
      )}
      {action.action_type === 'escalate' && (
        <input
          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-text"
          placeholder="Escalation reason"
          value={action.params.reason || ''}
          onChange={e => onChange({ ...action, params: { reason: e.target.value } })}
        />
      )}
    </div>
  )
}

function RuleBuilder({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: schema } = useQuery({
    queryKey: ['crm-rule-schema'],
    queryFn: () => crmApi.automationRules.schema().then(r => r.data),
  })

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_event: 'TICKET_CREATED',
    condition_logic: 'AND' as 'AND' | 'OR',
    conditions: [] as RuleCondition[],
    actions: [] as RuleAction[],
    priority: 100,
  })
  const [previewResult, setPreviewResult] = useState<any>(null)
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: () => crmApi.automationRules.create(form).then(r => r.data),
    onSuccess: () => { onSaved(); onClose() },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create rule'),
  })

  const previewMutation = useMutation({
    mutationFn: () => crmApi.automationRules.preview({
      conditions: form.conditions,
      condition_logic: form.condition_logic,
      trigger_event: form.trigger_event,
    }).then(r => r.data),
    onSuccess: data => setPreviewResult(data),
  })

  const addCondition = () =>
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: '', operator: 'eq', value: '' }] }))

  const addAction = () =>
    setForm(f => ({ ...f, actions: [...f.actions, { action_type: '', params: {} }] }))

  const steps = ['Basics', 'Conditions', 'Actions', 'Review']

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand" /> New Automation Rule
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text"><X className="w-5 h-5" /></button>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 pt-4 gap-1">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => setStep(i + 1)}
                className={`w-6 h-6 rounded-full text-xs font-medium transition-colors ${
                  step === i + 1
                    ? 'bg-brand text-white'
                    : step > i + 1
                    ? 'bg-green-500 text-white'
                    : 'bg-surface-2 text-text-muted'
                }`}
              >
                {step > i + 1 ? <CheckCircle2 className="w-3 h-3 mx-auto" /> : i + 1}
              </button>
              <span className={`text-xs ${step === i + 1 ? 'text-text' : 'text-text-muted'}`}>{s}</span>
              {i < steps.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Rule Name *</label>
                <input
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Auto-route fraud cases to Fraud Review"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted mb-1 block">Description</label>
                <textarea
                  className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text resize-none"
                  rows={2}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Trigger Event *</label>
                  <select
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text"
                    value={form.trigger_event}
                    onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value }))}
                  >
                    {(schema?.triggers || []).map((t: any) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">Priority (lower = first)</label>
                  <input
                    type="number"
                    className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text"
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 100 }))}
                    min={1}
                    max={999}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text font-medium">Conditions</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Logic:</span>
                  <button
                    onClick={() => setForm(f => ({ ...f, condition_logic: f.condition_logic === 'AND' ? 'OR' : 'AND' }))}
                    className={`px-3 py-1 rounded text-xs font-mono font-medium border ${
                      form.condition_logic === 'AND'
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {form.condition_logic}
                  </button>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                {form.condition_logic === 'AND'
                  ? 'All conditions must match'
                  : 'Any condition can match'}
              </p>
              <div className="space-y-2">
                {form.conditions.map((c, i) => (
                  <ConditionRow
                    key={i}
                    condition={c}
                    schema={schema}
                    onChange={nc => setForm(f => ({
                      ...f,
                      conditions: f.conditions.map((x, j) => j === i ? nc : x),
                    }))}
                    onRemove={() => setForm(f => ({
                      ...f,
                      conditions: f.conditions.filter((_, j) => j !== i),
                    }))}
                  />
                ))}
              </div>
              <button
                onClick={addCondition}
                className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
              >
                + Add Condition
              </button>
              {form.conditions.length > 0 && (
                <button
                  onClick={() => previewMutation.mutate()}
                  disabled={previewMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-xs text-text-muted hover:text-text"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {previewMutation.isPending ? 'Checking...' : 'Preview matching tickets'}
                </button>
              )}
              {previewResult && (
                <div className="bg-surface-2 rounded-lg p-3 border border-border">
                  <p className="text-xs font-medium text-text mb-2">
                    {previewResult.count} open ticket{previewResult.count !== 1 ? 's' : ''} match
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {previewResult.matches.slice(0, 5).map((m: any) => (
                      <div key={m.queue_id} className="flex items-center gap-2 text-xs text-text-muted">
                        <span className="font-mono">#{m.ticket_id}</span>
                        <span className="truncate">{m.subject || m.cx_email}</span>
                        {m.ai_fraud_segment && (
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            m.ai_fraud_segment === 'VERY_HIGH' ? 'bg-red-500/10 text-red-400' :
                            m.ai_fraud_segment === 'HIGH' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-gray-500/10 text-gray-400'
                          }`}>{m.ai_fraud_segment}</span>
                        )}
                      </div>
                    ))}
                    {previewResult.count > 5 && (
                      <p className="text-xs text-text-muted">+{previewResult.count - 5} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-text font-medium">Actions</p>
              <p className="text-xs text-text-muted">Actions run in order when conditions match.</p>
              <div className="space-y-2">
                {form.actions.map((a, i) => (
                  <ActionRow
                    key={i}
                    action={a}
                    schema={schema}
                    onChange={na => setForm(f => ({
                      ...f,
                      actions: f.actions.map((x, j) => j === i ? na : x),
                    }))}
                    onRemove={() => setForm(f => ({
                      ...f,
                      actions: f.actions.filter((_, j) => j !== i),
                    }))}
                  />
                ))}
              </div>
              <button
                onClick={addAction}
                className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-text-muted hover:text-text hover:border-text-muted transition-colors"
              >
                + Add Action
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-text font-medium">Review Rule</p>
              <div className="bg-surface-2 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${TRIGGER_COLORS[form.trigger_event]}`}>
                    {TRIGGER_LABELS[form.trigger_event]}
                  </span>
                  <ArrowRight className="w-4 h-4 text-text-muted" />
                  <span className="text-sm font-medium text-text">{form.name || 'Unnamed Rule'}</span>
                </div>
                {form.description && <p className="text-xs text-text-muted">{form.description}</p>}

                {form.conditions.length > 0 && (
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
                      Conditions ({form.condition_logic})
                    </p>
                    {form.conditions.map((c, i) => (
                      <div key={i} className="text-xs text-text font-mono bg-surface rounded p-2 mb-1">
                        {c.field} {c.operator} "{c.value}"
                      </div>
                    ))}
                  </div>
                )}

                {form.actions.length > 0 && (
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Actions</p>
                    {form.actions.map((a, i) => (
                      <div key={i} className="text-xs text-text bg-surface rounded p-2 mb-1 flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-brand/20 text-brand text-center leading-4">{i + 1}</span>
                        <span className="font-medium">{ACTION_LABELS[a.action_type] || a.action_type}</span>
                        {Object.keys(a.params || {}).length > 0 && (
                          <span className="text-text-muted">→ {JSON.stringify(a.params)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between p-5 border-t border-border">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="px-4 py-2 text-sm text-text-muted hover:text-text"
          >
            {step === 1 ? 'Cancel' : '← Back'}
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !form.name.trim()}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.name.trim() || form.actions.length === 0 || createMutation.isPending}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving...' : 'Create Rule'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RuleCard({ rule, onToggle, onDelete }: { rule: AutomationRule; onToggle: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`bg-surface border rounded-xl transition-colors ${rule.is_active ? 'border-border' : 'border-border/40 opacity-60'}`}>
      <div className="flex items-center gap-3 p-4">
        {/* Toggle */}
        <button onClick={onToggle} className="shrink-0 text-text-muted hover:text-text">
          {rule.is_active
            ? <ToggleRight className="w-5 h-5 text-green-500" />
            : <ToggleLeft className="w-5 h-5" />}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${TRIGGER_COLORS[rule.trigger_event]}`}>
              {TRIGGER_LABELS[rule.trigger_event]}
            </span>
            {rule.is_seeded && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Cardinal
              </span>
            )}
            <span className="text-xs text-text-muted">Priority {rule.priority}</span>
          </div>
          <p className="text-sm font-medium text-text truncate">{rule.name}</p>
          {rule.description && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{rule.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-xs text-text-muted">Ran {rule.run_count} times</p>
          {rule.last_run_at && (
            <p className="text-xs text-text-muted">
              Last: {new Date(rule.last_run_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 text-text-muted hover:text-text rounded"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-400 hover:text-red-300 rounded"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {/* Conditions */}
          {(rule.conditions || []).length > 0 && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Conditions ({rule.condition_logic || 'AND'})
              </p>
              <div className="space-y-1">
                {rule.conditions.map((c, i) => (
                  <div key={i} className="text-xs font-mono text-text bg-surface-2 rounded px-3 py-1.5">
                    <span className="text-text-muted">{c.field}</span>{' '}
                    <span className="text-brand">{c.operator}</span>{' '}
                    <span className="text-green-400">"{c.value}"</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {(rule.actions || []).length > 0 && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Actions</p>
              <div className="space-y-1">
                {rule.actions.map((a, i) => (
                  <div key={i} className="text-xs text-text bg-surface-2 rounded px-3 py-1.5 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-brand/20 text-brand text-center text-xs leading-4 shrink-0">{i + 1}</span>
                    <span className="font-medium">{ACTION_LABELS[a.action_type] || a.action_type}</span>
                    {Object.keys(a.params || {}).length > 0 && (
                      <span className="text-text-muted truncate">
                        → {Object.entries(a.params).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CRMAutomationPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [showBuilder, setShowBuilder] = useState(false)

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['crm-automation-rules'],
    queryFn: () => crmApi.automationRules.list().then(r => r.data as AutomationRule[]),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: number) => crmApi.automationRules.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-automation-rules'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => crmApi.automationRules.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-automation-rules'] }),
  })

  const activeCount  = rules.filter((r: AutomationRule) => r.is_active).length
  const seededCount  = rules.filter((r: AutomationRule) => r.is_seeded).length
  const totalRuns    = rules.reduce((sum: number, r: AutomationRule) => sum + (r.run_count || 0), 0)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand" /> Automation Rules
          </h1>
          <p className="text-sm text-text-muted mt-1">Cardinal-powered trigger-based automation for your CRM queue</p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90"
        >
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Active Rules', value: activeCount, color: 'text-green-400' },
          { label: 'Cardinal Rules', value: seededCount, color: 'text-brand' },
          { label: 'Total Executions', value: totalRuns.toLocaleString('en-IN'), color: 'text-text' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-text-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Cardinal info banner */}
      {seededCount > 0 && (
        <div className="bg-brand/5 border border-brand/20 rounded-xl p-4 mb-5 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-text font-medium">
              {seededCount} Cardinal signal rules are active
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              These rules fire automatically when Cardinal's 4-stage pipeline produces high-fraud, low-confidence, or SLA-at-risk signals — routing tickets before any agent touches them.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-surface-2 rounded-xl animate-pulse" />)}
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-20 text-text-muted">
          <Zap className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">No automation rules yet.</p>
          <p className="text-xs mt-1">Create your first rule to start automating ticket routing.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule: AutomationRule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => toggleMutation.mutate(rule.id)}
              onDelete={() => deleteMutation.mutate(rule.id)}
            />
          ))}
        </div>
      )}

      {showBuilder && (
        <RuleBuilder
          onClose={() => setShowBuilder(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['crm-automation-rules'] })}
        />
      )}
    </div>
  )
}
