import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminWorkspaces() {
  const navigate = useNavigate()
  const { currentWorkspace, switchWorkspace, planType } = useWorkspace()
  const toast = useToast()

  const [enterpriseAccount, setEnterpriseAccount] = useState(null)
  const [linkedWorkspaces, setLinkedWorkspaces] = useState([])
  const [wsStats, setWsStats] = useState({}) // { workspace_id: { ca, orders, deliveries } }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEnterpriseData()
  }, [])

  const loadEnterpriseData = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Récupérer le compte enterprise de l'utilisateur
      const { data: account } = await supabase
        .from('enterprise_accounts')
        .select('*')
        .eq('owner_user_id', user.id)
        .eq('is_active', true)
        .single()

      if (!account) {
        setLoading(false)
        return
      }
      setEnterpriseAccount(account)

      // Récupérer les workspaces liés
      const { data: links } = await supabase
        .from('enterprise_workspace_links')
        .select(`
          workspace_id,
          linked_at,
          workspace:workspaces(
            id, name, subscription_status, plan_type, is_active,
            city, country
          )
        `)
        .eq('enterprise_account_id', account.id)

      const workspaces = (links || [])
        .map(l => l.workspace)
        .filter(Boolean)

      setLinkedWorkspaces(workspaces)

      // Stats par workspace (CA mois en cours + commandes en cours)
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const statsMap = {}
      await Promise.all(workspaces.map(async (ws) => {
        const [ordersRes, deliveriesRes, paymentsRes] = await Promise.all([
          supabase.from('orders').select('id, status', { count: 'exact' })
            .eq('workspace_id', ws.id)
            .in('status', ['confirme', 'en_preparation', 'en_livraison', 'en_cours']),
          supabase.from('deliveries').select('id', { count: 'exact' })
            .eq('workspace_id', ws.id)
            .not('status', 'in', '("livree","annulee")'),
          supabase.from('payments').select('amount')
            .eq('workspace_id', ws.id)
            .gte('payment_date', monthStart.split('T')[0])
            .lte('payment_date', monthEnd.split('T')[0]),
        ])
        const caMonth = (paymentsRes.data || []).reduce((s, p) => s + (p.amount || 0), 0)
        statsMap[ws.id] = {
          commandesEnCours: ordersRes.count || 0,
          livraisonsActives: deliveriesRes.count || 0,
          caMonth,
        }
      }))
      setWsStats(statsMap)
    } catch (err) {
      console.error('[AdminWorkspaces]', err)
      toast.error('Erreur chargement données Enterprise')
    } finally {
      setLoading(false)
    }
  }

  // Totaux consolidés
  const totals = linkedWorkspaces.reduce((acc, ws) => {
    const s = wsStats[ws.id] || {}
    acc.caTotal += s.caMonth || 0
    acc.commandesTotal += s.commandesEnCours || 0
    acc.livraisonsTotal += s.livraisonsActives || 0
    return acc
  }, { caTotal: 0, commandesTotal: 0, livraisonsTotal: 0 })

  const handleSwitchToWorkspace = async (wsId) => {
    await switchWorkspace(wsId)
    navigate('/dashboard')
    toast.success('Workspace changé')
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent" />
      </div>
    )
  }

  // Pas de compte enterprise
  if (!enterpriseAccount) {
    return (
      <div className="p-4 md:p-8 min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#040741] mb-3">Plan Enterprise requis</h1>
          <p className="text-gray-500 mb-6">
            Le tableau de bord multi-workspace est réservé aux clients Enterprise. Contactez-nous pour découvrir l'offre.
          </p>
          <button
            onClick={() => navigate('/entreprise')}
            className="px-6 py-3 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#040741] transition-colors"
          >
            Découvrir l'offre Enterprise
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
          <div className="w-10 h-10 bg-gradient-to-br from-[#313ADF] to-[#040741] rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Mes magasins</h1>
            <p className="text-gray-400 text-sm">{enterpriseAccount.name} · {linkedWorkspaces.length} magasin{linkedWorkspaces.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* KPIs consolidés */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-2xl font-bold text-green-700">
            {totals.caTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
          </p>
          <p className="text-xs text-gray-500 mt-1">CA encaissé ce mois</p>
          <p className="text-xs text-gray-400">Tous magasins</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-2xl font-bold text-[#313ADF]">{totals.commandesTotal}</p>
          <p className="text-xs text-gray-500 mt-1">Commandes en cours</p>
          <p className="text-xs text-gray-400">Tous magasins</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-2xl font-bold text-orange-600">{totals.livraisonsTotal}</p>
          <p className="text-xs text-gray-500 mt-1">Livraisons actives</p>
          <p className="text-xs text-gray-400">Tous magasins</p>
        </div>
      </div>

      {/* Liste des workspaces */}
      <div className="mb-6">
        <h2 className="text-base font-bold text-[#040741] mb-4">Vos magasins</h2>
        {linkedWorkspaces.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <p className="text-gray-400">Aucun workspace lié à ce compte Enterprise.</p>
            <p className="text-gray-400 text-sm mt-1">Contactez NeoFlow Agency pour rattacher vos magasins.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {linkedWorkspaces.map(ws => {
              const s = wsStats[ws.id] || {}
              const isCurrent = currentWorkspace?.id === ws.id
              return (
                <div
                  key={ws.id}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${isCurrent ? 'border-[#313ADF]/40 ring-2 ring-[#313ADF]/20' : 'border-gray-100'}`}
                >
                  {/* Header */}
                  <div className={`px-5 py-4 flex items-center justify-between ${isCurrent ? 'bg-[#313ADF]/5' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${isCurrent ? 'bg-[#313ADF] text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {(ws.name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-[#040741] text-sm">{ws.name}</p>
                        {ws.city && <p className="text-xs text-gray-400">{ws.city}{ws.country ? `, ${ws.country}` : ''}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${ws.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                      {isCurrent && <span className="text-xs text-[#313ADF] font-medium">Actif</span>}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="px-5 py-4 grid grid-cols-3 gap-3 text-center border-b border-gray-50">
                    <div>
                      <p className="text-lg font-bold text-green-700">
                        {(s.caMonth || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                      </p>
                      <p className="text-xs text-gray-400">CA mois</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-[#313ADF]">{s.commandesEnCours || 0}</p>
                      <p className="text-xs text-gray-400">Commandes</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-orange-500">{s.livraisonsActives || 0}</p>
                      <p className="text-xs text-gray-400">Livraisons</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-5 py-3 flex items-center gap-2">
                    {!isCurrent ? (
                      <button
                        onClick={() => handleSwitchToWorkspace(ws.id)}
                        className="flex-1 py-2 bg-[#313ADF] text-white rounded-xl text-sm font-semibold hover:bg-[#040741] transition-colors"
                      >
                        Passer sur ce magasin
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate('/dashboard')}
                        className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
                      >
                        Voir le dashboard
                      </button>
                    )}
                    <button
                      onClick={() => handleSwitchToWorkspace(ws.id).then(() => navigate('/livraisons'))}
                      className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-colors"
                      title="Livraisons"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Comparatif CA */}
      {linkedWorkspaces.length > 1 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-[#040741] mb-4">Comparatif CA — ce mois</h2>
          <div className="space-y-3">
            {[...linkedWorkspaces]
              .sort((a, b) => (wsStats[b.id]?.caMonth || 0) - (wsStats[a.id]?.caMonth || 0))
              .map(ws => {
                const s = wsStats[ws.id] || {}
                const maxCA = Math.max(...linkedWorkspaces.map(w => wsStats[w.id]?.caMonth || 0), 1)
                const pct = ((s.caMonth || 0) / maxCA) * 100
                return (
                  <div key={ws.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-[#040741]">{ws.name}</span>
                      <span className="text-sm font-bold text-[#313ADF]">
                        {(s.caMonth || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-[#313ADF] to-[#4149e8] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
          </div>
          <p className="text-xs text-gray-400 mt-3">Basé sur les paiements encaissés ce mois.</p>
        </div>
      )}

      {/* Footer info */}
      <div className="mt-6 bg-[#040741]/5 border border-[#040741]/10 rounded-2xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-[#313ADF] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm text-gray-600">
          Pour ajouter un magasin, modifier des accès ou gérer votre contrat Enterprise, contactez NeoFlow Agency.
          Le rattachement des workspaces est géré manuellement pour garantir la sécurité de vos données.
        </p>
      </div>
    </div>
  )
}
