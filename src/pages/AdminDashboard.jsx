import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, invokeFunction } from '../lib/supabase'
import { isAdminUser } from '../lib/earlyAccess'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'early-access' | 'standard'
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('users')

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !isAdminUser(user.email)) {
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
      setError(err.message || 'Erreur lors du chargement des donnees')
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = data?.users?.filter(u => {
    if (search) {
      const q = search.toLowerCase()
      if (!u.full_name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false
    }
    if (filter === 'early-access') {
      return data.workspaces.some(ws => ws.plan_type === 'early-access' && data.workspaces.some(w => w.owner_email === u.email))
    }
    return true
  }) || []

  const filteredWorkspaces = data?.workspaces?.filter(ws => {
    if (search) {
      const q = search.toLowerCase()
      if (!ws.name?.toLowerCase().includes(q) && !ws.owner_name?.toLowerCase().includes(q) && !ws.owner_email?.toLowerCase().includes(q)) return false
    }
    if (filter === 'early-access') return ws.plan_type === 'early-access'
    if (filter === 'standard') return ws.plan_type !== 'early-access'
    return true
  }) || []

  const StatCard = ({ label, value, color }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color || 'text-[#040741]'}`}>{value}</p>
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
      early_access: 'Acces anticipe',
      active: 'Actif',
      trialing: 'Essai',
      past_due: 'Retard',
      canceled: 'Annule',
      incomplete: 'Incomplet',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
        {labels[status] || status || 'Inconnu'}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
          <p className="text-[#040741] font-medium">Chargement des donnees admin...</p>
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
            Reessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-r from-[#313ADF] to-purple-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Dashboard Admin</h1>
        </div>
        <p className="text-gray-500">Vue d'ensemble de tous les utilisateurs et workspaces</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total utilisateurs" value={data?.stats?.totalUsers || 0} />
        <StatCard label="Total workspaces" value={data?.stats?.totalWorkspaces || 0} />
        <StatCard label="Acces anticipe payes" value={data?.stats?.earlyAccessPaid || 0} color="text-[#313ADF]" />
        <StatCard label="Acces anticipe total" value={data?.stats?.earlyAccessTotal || 0} color="text-purple-600" />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'Tous' },
            { key: 'early-access', label: 'Acces anticipe' },
            { key: 'standard', label: 'Standard' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-[#313ADF] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou email..."
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
        />
        <button
          onClick={loadData}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualiser
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'users' ? 'bg-[#040741] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Utilisateurs ({filteredUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('workspaces')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === 'workspaces' ? 'bg-[#040741] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Workspaces ({filteredWorkspaces.length})
        </button>
      </div>

      {/* Users Table */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nom</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Inscription</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Workspaces</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Derniere connexion</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-[#040741]">{user.full_name || '-'}</span>
                      {user.deleted_at && <span className="ml-2 text-xs text-red-500">(supprime)</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#313ADF]/10 text-[#313ADF] text-sm font-semibold">
                        {user.workspace_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Jamais'}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">Aucun utilisateur trouve</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workspaces Table */}
      {activeTab === 'workspaces' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Workspace</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Proprietaire</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actif</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Membres</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Creation</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkspaces.map(ws => (
                  <tr key={ws.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-[#040741]">{ws.name}</span>
                      <p className="text-xs text-gray-400">{ws.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{ws.owner_name || '-'}</span>
                      <p className="text-xs text-gray-400">{ws.owner_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {ws.plan_type === 'early-access' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">Acces anticipe</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Standard</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ws.subscription_status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ws.is_active ? (
                        <span className="inline-flex w-3 h-3 rounded-full bg-green-500"></span>
                      ) : (
                        <span className="inline-flex w-3 h-3 rounded-full bg-red-400"></span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm text-gray-600">{ws.member_count}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {ws.created_at ? new Date(ws.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                  </tr>
                ))}
                {filteredWorkspaces.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Aucun workspace trouve</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
