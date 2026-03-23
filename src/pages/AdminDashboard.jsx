import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, invokeFunction } from '../lib/supabase'
import { isAdminUser } from '../lib/earlyAccess'

const SURVEY_QUESTIONS = {
  discovery: 'Comment découvert ?',
  reason: 'Pourquoi choisi ?',
  expectation: 'Attentes principales',
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [wsStatusFilter, setWsStatusFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminUser(user)) {
        navigate('/dashboard', { replace: true })
        return
      }
      loadData()
    }
    checkAccess()
  }, [navigate])

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await invokeFunction('admin-data', {})
      setData(result)
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // ── Filtered lists ──────────────────────────────────────────
  const filteredUsers = (data?.users || []).filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  const filteredWorkspaces = (data?.workspaces || []).filter(ws => {
    const matchSearch = !search ||
      ws.name?.toLowerCase().includes(search.toLowerCase()) ||
      ws.owner_email?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = wsStatusFilter === 'all' || ws.subscription_status === wsStatusFilter
    return matchSearch && matchStatus
  })

  const surveyUsers = (data?.users || []).filter(u => u.onboarding_survey)

  // ── Survey aggregation ─────────────────────────────────────
  const aggregateSurvey = (questionId) => {
    const counts = {}
    surveyUsers.forEach(u => {
      const answer = u.onboarding_survey?.[questionId]
      const items = Array.isArray(answer) ? answer : answer ? [answer] : []
      items.forEach(item => { counts[item] = (counts[item] || 0) + 1 })
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }

  // ── Sub-components ──────────────────────────────────────────
  const StatCard = ({ label, value, sub, color, icon }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      {icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color || 'bg-[#313ADF]/10'}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${color ? 'text-inherit' : 'text-[#040741]'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )

  const StatusBadge = ({ status }) => {
    const styles = {
      early_access: 'bg-purple-100 text-purple-700',
      active: 'bg-green-100 text-green-700',
      trialing: 'bg-blue-100 text-blue-700',
      past_due: 'bg-orange-100 text-orange-700',
      canceled: 'bg-red-100 text-red-700',
      incomplete: 'bg-gray-100 text-gray-600',
    }
    const labels = {
      early_access: 'Accès anticipé', active: 'Actif', trialing: 'Essai',
      past_due: 'Retard', canceled: 'Annulé', incomplete: 'Incomplet',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status || '—'}
      </span>
    )
  }

  const tabs = [
    { key: 'overview', label: 'Vue d\'ensemble' },
    { key: 'users', label: `Utilisateurs (${filteredUsers.length})` },
    { key: 'workspaces', label: `Workspaces (${filteredWorkspaces.length})` },
    { key: 'surveys', label: `Sondages (${surveyUsers.length})` },
  ]

  if (loading) {
    return (
      <div className="p-4 md:p-8 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent" />
          <p className="text-[#040741] font-medium">Chargement des données admin...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-8 min-h-screen">
        <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-xl">
          <p className="font-semibold">Erreur</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={loadData} className="mt-3 bg-red-100 text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors">
            Réessayer
          </button>
        </div>
      </div>
    )
  }

  const s = data?.stats || {}

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-gradient-to-r from-[#313ADF] to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#040741]">Dashboard Admin</h1>
          </div>
          <p className="text-gray-500 text-sm">Vue interne — tous les workspaces et utilisateurs</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualiser
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key ? 'bg-[#040741] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ─────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Utilisateurs"
              value={s.totalUsers || 0}
              icon={<svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
              color="bg-[#313ADF]/10"
            />
            <StatCard
              label="Workspaces"
              value={s.totalWorkspaces || 0}
              icon={<svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
              color="bg-purple-50"
            />
            <StatCard
              label="MRR estimé"
              value={`${(s.mrrEstimate || 0).toFixed(0)} €`}
              sub={`${s.activeWorkspaces || 0} abonnements actifs`}
              icon={<svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              color="bg-green-50"
            />
            <StatCard
              label="Sondages remplis"
              value={s.surveyResponses || 0}
              sub={`sur ${s.totalUsers || 0} utilisateurs`}
              icon={<svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
              color="bg-orange-50"
            />
          </div>

          {/* Subscription breakdown */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-base font-bold text-[#040741] mb-4">Répartition des abonnements</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Actifs', value: s.activeWorkspaces || 0, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
                { label: 'En essai', value: s.trialingWorkspaces || 0, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
                { label: 'En retard', value: s.pastDueWorkspaces || 0, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
                { label: 'Annulés', value: s.canceledWorkspaces || 0, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
              ].map(item => (
                <div key={item.label} className={`rounded-xl border p-4 ${item.bg}`}>
                  <p className="text-xs font-medium text-gray-500">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent workspaces */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50">
              <h3 className="text-base font-bold text-[#040741]">Derniers workspaces créés</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {(data?.workspaces || []).slice(0, 8).map(ws => (
                <div key={ws.id} className="px-6 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#040741] truncate">{ws.name}</p>
                    <p className="text-xs text-gray-400">{ws.owner_email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={ws.subscription_status} />
                    <span className="text-xs text-gray-400">
                      {ws.created_at ? new Date(ws.created_at).toLocaleDateString('fr-FR') : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Users ────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
          />
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nom / Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Inscription</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">WS</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Sondage</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Dernière connexion</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-[#040741]">
                          {user.full_name || '—'}
                          {user.deleted_at && <span className="ml-2 text-xs text-red-400">(supprimé)</span>}
                        </p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#313ADF]/10 text-[#313ADF] text-xs font-semibold">
                          {user.workspace_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {user.onboarding_survey ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                            <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Jamais'}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Aucun utilisateur</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Workspaces ───────────────────────────────── */}
      {activeTab === 'workspaces' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
            <select
              value={wsStatusFilter}
              onChange={(e) => setWsStatusFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="trialing">Essai</option>
              <option value="past_due">Retard</option>
              <option value="canceled">Annulé</option>
              <option value="incomplete">Incomplet</option>
            </select>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Workspace</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Propriétaire</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actif</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Membres</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Créé le</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkspaces.map(ws => (
                    <tr key={ws.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#040741]">{ws.name}</p>
                        <p className="text-xs text-gray-400">{ws.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-600">{ws.owner_name || '—'}</p>
                        <p className="text-xs text-gray-400">{ws.owner_email}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={ws.subscription_status} /></td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex w-2.5 h-2.5 rounded-full ${ws.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">{ws.member_count}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {ws.created_at ? new Date(ws.created_at).toLocaleDateString('fr-FR') : '—'}
                      </td>
                    </tr>
                  ))}
                  {filteredWorkspaces.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">Aucun workspace</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Surveys ──────────────────────────────────── */}
      {activeTab === 'surveys' && (
        <div className="space-y-6">
          {/* Aggregations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(SURVEY_QUESTIONS).map(([qId, qLabel]) => {
              const counts = aggregateSurvey(qId)
              const total = counts.reduce((s, [, c]) => s + c, 0)
              return (
                <div key={qId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-[#040741] mb-3">{qLabel}</h3>
                  {counts.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucune réponse</p>
                  ) : (
                    <div className="space-y-2">
                      {counts.map(([option, count]) => (
                        <div key={option}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-600 truncate">{option}</span>
                            <span className="text-gray-500 font-medium ml-2 flex-shrink-0">
                              {count} ({total > 0 ? Math.round((count / surveyUsers.length) * 100) : 0}%)
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#313ADF] rounded-full"
                              style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Individual responses */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#040741]">Réponses individuelles</h3>
              <span className="text-sm text-gray-400">{surveyUsers.length} réponse{surveyUsers.length !== 1 ? 's' : ''}</span>
            </div>
            {surveyUsers.length === 0 ? (
              <div className="px-6 py-10 text-center text-gray-400 text-sm">Aucune réponse pour l'instant</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {surveyUsers.map(user => (
                  <div key={user.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-[#040741]">{user.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                      <p className="text-xs text-gray-400 flex-shrink-0">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : ''}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {Object.entries(SURVEY_QUESTIONS).map(([qId, qLabel]) => {
                        const answer = user.onboarding_survey?.[qId]
                        const items = Array.isArray(answer) ? answer : answer ? [answer] : []
                        return (
                          <div key={qId} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{qLabel}</p>
                            {items.length === 0 ? (
                              <span className="text-xs text-gray-300">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {items.map(item => (
                                  <span key={item} className="px-2 py-0.5 bg-[#313ADF]/10 text-[#313ADF] text-xs rounded-full font-medium">
                                    {item}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
