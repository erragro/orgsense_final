import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Shield, AlertTriangle, TrendingUp, Star,
  ChevronRight, Pencil, UserPlus, UserMinus, Check, X,
} from 'lucide-react'
import { crmApi } from '@/api/governance/crm.api'
import { useAuthStore } from '@/stores/auth.store'
import { hasPermission } from '@/lib/access'
import type { Group, GroupMember } from '@/types/crm.types'

const GROUP_TYPE_COLORS: Record<string, string> = {
  SUPPORT: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  FRAUD_REVIEW: 'bg-red-500/10 text-red-400 border border-red-500/20',
  ESCALATION: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  SENIOR_REVIEW: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  CUSTOM: 'bg-gray-500/10 text-gray-400 border border-gray-500/20',
}

const GROUP_TYPE_ICONS: Record<string, React.ReactNode> = {
  SUPPORT: <Users className="w-4 h-4" />,
  FRAUD_REVIEW: <Shield className="w-4 h-4" />,
  ESCALATION: <AlertTriangle className="w-4 h-4" />,
  SENIOR_REVIEW: <Star className="w-4 h-4" />,
  CUSTOM: <TrendingUp className="w-4 h-4" />,
}

const ROUTING_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round Robin',
  LEAST_BUSY: 'Least Busy',
  MANUAL: 'Manual',
}

const AVAILABILITY_COLORS: Record<string, string> = {
  ONLINE: 'bg-green-500',
  BUSY: 'bg-amber-500',
  AWAY: 'bg-yellow-500',
  OFFLINE: 'bg-gray-500',
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    group_type: 'SUPPORT',
    routing_strategy: 'ROUND_ROBIN',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => crmApi.groups.create(form).then(r => r.data),
    onSuccess: () => { onCreated(); onClose() },
    onError: (e: any) => setError(e.response?.data?.detail || 'Failed to create group'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-semibold text-text mb-4">Create Agent Group</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-muted mb-1 block">Group Name *</label>
            <input
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Fraud Review Team"
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
              <label className="text-xs text-text-muted mb-1 block">Group Type</label>
              <select
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text"
                value={form.group_type}
                onChange={e => setForm(f => ({ ...f, group_type: e.target.value }))}
              >
                {['SUPPORT', 'FRAUD_REVIEW', 'ESCALATION', 'SENIOR_REVIEW', 'CUSTOM'].map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Routing Strategy</label>
              <select
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text"
                value={form.routing_strategy}
                onChange={e => setForm(f => ({ ...f, routing_strategy: e.target.value }))}
              >
                {Object.entries(ROUTING_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-muted hover:text-text">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GroupDetailPanel({
  group,
  onClose,
  canAdmin,
}: {
  group: Group
  onClose: () => void
  canAdmin: boolean
}) {
  const qc = useQueryClient()
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState('AGENT')
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    name: group.name,
    routing_strategy: group.routing_strategy,
    is_active: group.is_active,
  })

  const { data: detail, refetch } = useQuery({
    queryKey: ['crm-group-detail', group.id],
    queryFn: () => crmApi.groups.get(group.id).then(r => r.data as Group),
    initialData: group,
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['crm-agents-simple'],
    queryFn: () => crmApi.getAgents().then(r => r.data),
  })

  const addMember = useMutation({
    mutationFn: () => crmApi.groups.addMember(group.id, { user_id: parseInt(addUserId), role: addRole }),
    onSuccess: () => { refetch(); setAddUserId('') },
  })

  const removeMember = useMutation({
    mutationFn: (userId: number) => crmApi.groups.removeMember(group.id, userId),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['crm-groups'] }) },
  })

  const updateGroup = useMutation({
    mutationFn: () => crmApi.groups.update(group.id, editForm),
    onSuccess: () => { setEditMode(false); refetch(); qc.invalidateQueries({ queryKey: ['crm-groups'] }) },
  })

  const memberIds = new Set((detail?.members || []).map((m: GroupMember) => m.user_id))
  const availableAgents = agents.filter((a: any) => !memberIds.has(a.id))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-end z-50">
      <div className="bg-surface border-l border-border w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${GROUP_TYPE_COLORS[detail?.group_type || 'SUPPORT']}`}>
              {GROUP_TYPE_ICONS[detail?.group_type || 'SUPPORT']}
            </div>
            <div>
              {editMode ? (
                <input
                  className="bg-surface-2 border border-border rounded px-2 py-1 text-sm text-text"
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                />
              ) : (
                <h2 className="font-semibold text-text">{detail?.name}</h2>
              )}
              <p className="text-xs text-text-muted">{detail?.member_count} members</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Settings */}
          <div className="bg-surface-2 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Settings</span>
              {canAdmin && !editMode && (
                <button onClick={() => setEditMode(true)} className="text-xs text-brand hover:underline flex items-center gap-1">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-text-muted mb-1">Type</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${GROUP_TYPE_COLORS[detail?.group_type || '']}`}>
                  {detail?.group_type?.replace('_', ' ')}
                </span>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Routing</p>
                {editMode ? (
                  <select
                    className="bg-surface border border-border rounded px-2 py-1 text-xs text-text"
                    value={editForm.routing_strategy}
                    onChange={e => setEditForm(f => ({ ...f, routing_strategy: e.target.value }))}
                  >
                    {Object.entries(ROUTING_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-text">{ROUTING_LABELS[detail?.routing_strategy || ''] || detail?.routing_strategy}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Status</p>
                {editMode ? (
                  <select
                    className="bg-surface border border-border rounded px-2 py-1 text-xs text-text"
                    value={editForm.is_active ? 'active' : 'inactive'}
                    onChange={e => setEditForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${detail?.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                    {detail?.is_active ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>
            </div>
            {editMode && (
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => updateGroup.mutate()}
                  disabled={updateGroup.isPending}
                  className="px-3 py-1 bg-brand text-white rounded text-xs"
                >
                  <Check className="w-3 h-3 inline mr-1" />Save
                </button>
                <button onClick={() => setEditMode(false)} className="px-3 py-1 text-text-muted text-xs">Cancel</button>
              </div>
            )}
          </div>

          {/* Members */}
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Members</p>
            <div className="space-y-2">
              {(detail?.members || []).map((m: GroupMember) => (
                <div key={m.user_id} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-xs text-brand font-medium">
                        {(m.full_name || m.email || '?')[0].toUpperCase()}
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-surface ${AVAILABILITY_COLORS[m.crm_availability || 'OFFLINE']}`} />
                    </div>
                    <div>
                      <p className="text-xs text-text font-medium">{m.full_name || m.email}</p>
                      <p className="text-xs text-text-muted">{m.role}</p>
                    </div>
                  </div>
                  {canAdmin && (
                    <button
                      onClick={() => removeMember.mutate(m.user_id)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {(detail?.members || []).length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">No members yet</p>
              )}
            </div>

            {/* Add member */}
            {canAdmin && availableAgents.length > 0 && (
              <div className="mt-3 flex gap-2">
                <select
                  className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text"
                  value={addUserId}
                  onChange={e => setAddUserId(e.target.value)}
                >
                  <option value="">Add agent...</option>
                  {availableAgents.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.full_name || a.email}</option>
                  ))}
                </select>
                <select
                  className="bg-surface-2 border border-border rounded-lg px-2 py-2 text-xs text-text"
                  value={addRole}
                  onChange={e => setAddRole(e.target.value)}
                >
                  <option value="AGENT">Agent</option>
                  <option value="LEAD">Lead</option>
                  <option value="MANAGER">Manager</option>
                </select>
                <button
                  onClick={() => addMember.mutate()}
                  disabled={!addUserId || addMember.isPending}
                  className="px-3 py-2 bg-brand/10 text-brand border border-brand/20 rounded-lg text-xs hover:bg-brand/20 disabled:opacity-50"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CRMGroupsPage() {
  const { user } = useAuthStore()
  const canAdmin = hasPermission(user, 'crm', 'admin')
  const qc = useQueryClient()

  const [showCreate, setShowCreate] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['crm-groups'],
    queryFn: () => crmApi.groups.list().then(r => r.data as Group[]),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text">Agent Groups</h1>
          <p className="text-sm text-text-muted mt-1">Organize agents into teams with routing strategies</p>
        </div>
        {canAdmin && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90"
          >
            <Plus className="w-4 h-4" /> New Group
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-text-muted">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">No groups yet. Create your first agent group.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group: Group) => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className="bg-surface border border-border rounded-xl p-5 text-left hover:border-brand/40 hover:bg-surface-2 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2 rounded-lg ${GROUP_TYPE_COLORS[group.group_type] || GROUP_TYPE_COLORS.CUSTOM}`}>
                  {GROUP_TYPE_ICONS[group.group_type] || <Users className="w-4 h-4" />}
                </div>
                <div className="flex items-center gap-2">
                  {!group.is_active && (
                    <span className="text-xs text-gray-500 bg-gray-500/10 px-2 py-0.5 rounded-full">Inactive</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-text transition-colors" />
                </div>
              </div>
              <h3 className="font-medium text-text mb-1">{group.name}</h3>
              {group.description && (
                <p className="text-xs text-text-muted mb-3 line-clamp-2">{group.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {group.member_count} members
                </span>
                <span className={`px-2 py-0.5 rounded-full ${GROUP_TYPE_COLORS[group.group_type] || ''}`}>
                  {ROUTING_LABELS[group.routing_strategy] || group.routing_strategy}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['crm-groups'] })}
        />
      )}

      {selectedGroup && (
        <GroupDetailPanel
          group={selectedGroup}
          canAdmin={canAdmin}
          onClose={() => setSelectedGroup(null)}
        />
      )}
    </div>
  )
}
