import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading, isLivreur, isEarlyAccess, role } = useWorkspace()
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState({
    caMois: 0,
    beneficeMois: 0,
    commandesEnCours: 0,
    livraisonsAFaire: 0,
    acomptesEnAttente: 0,
    soldesARecuperer: 0,
    tauxConversion: 0,
    margeMoyenne: 0
  })
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  const canViewMargins = role === 'proprietaire' || role === 'manager'

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    loadData()
  }, [workspace?.id, wsLoading])

  const loadData = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      setUser(currentUser)

      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

      const [
        ordersThisMonthRes,
        ordersInProgressRes,
        deliveriesRes,
        orderItemsMarginRes,
        quotesRes,
        ordersFromQuoteRes,
        recentOrdersRes
      ] = await Promise.all([
        // CA du mois (orders terminés ce mois)
        supabase
          .from('orders')
          .select('id, total_ttc, subtotal_ht, amount_paid, remaining_amount')
          .eq('workspace_id', workspace.id)
          .eq('status', 'termine')
          .gte('created_at', startOfMonth)
          .lte('created_at', endOfMonth),

        // Commandes en cours (confirme + en_cours)
        supabase
          .from('orders')
          .select('id, status, amount_paid, remaining_amount')
          .eq('workspace_id', workspace.id)
          .in('status', ['confirme', 'en_cours']),

        // Livraisons à effectuer
        supabase
          .from('deliveries')
          .select('id, status')
          .eq('workspace_id', workspace.id)
          .not('status', 'in', '("livree","annulee")'),

        // Marges du mois (management only)
        canViewMargins ? supabase
          .from('order_items')
          .select('quantity, unit_price_ht, cost_price_ht, order_id')
          .in('order_id',
            supabase
              .from('orders')
              .select('id')
              .eq('workspace_id', workspace.id)
              .eq('status', 'termine')
              .gte('created_at', startOfMonth)
              .lte('created_at', endOfMonth)
          ) : Promise.resolve({ data: [] }),

        // Total devis (pour taux conversion)
        supabase
          .from('quotes')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id),

        // Devis convertis en commandes
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id)
          .eq('source', 'from_quote'),

        // Dernières commandes
        supabase
          .from('orders')
          .select('id, order_number, total_ttc, amount_paid, remaining_amount, status, created_at, customer:customers(first_name, last_name)')
          .eq('workspace_id', workspace.id)
          .order('created_at', { ascending: false })
          .limit(5)
      ])

      const ordersThisMonth = ordersThisMonthRes.data || []
      const ordersInProgress = ordersInProgressRes.data || []
      const deliveries = deliveriesRes.data || []
      const orderItemsMargin = orderItemsMarginRes.data || []

      // CA du mois
      const caMois = ordersThisMonth.reduce((sum, o) => sum + (o.total_ttc || 0), 0)

      // Benefice du mois
      const caHtMois = ordersThisMonth.reduce((sum, o) => sum + (o.subtotal_ht || 0), 0)
      const coutsMois = orderItemsMargin.reduce((sum, i) => {
        return sum + ((i.cost_price_ht || 0) * (i.quantity || 0))
      }, 0)
      const beneficeMois = caHtMois - coutsMois

      // Marge moyenne
      const margeMoyenne = caHtMois > 0 ? ((caHtMois - coutsMois) / caHtMois) * 100 : 0

      // Acomptes en attente: orders en cours avec acompte versé mais pas soldé
      const acomptesEnAttente = ordersInProgress
        .filter(o => (o.amount_paid || 0) > 0 && (o.remaining_amount || 0) > 0)
        .reduce((sum, o) => sum + (o.remaining_amount || 0), 0)

      // Soldes à récupérer: orders livrés mais pas entièrement payés
      const ordersLivresRes = await supabase
        .from('orders')
        .select('id, remaining_amount')
        .eq('workspace_id', workspace.id)
        .eq('status', 'livre')
        .gt('remaining_amount', 0)

      const soldesARecuperer = (ordersLivresRes.data || []).reduce((sum, o) => sum + (o.remaining_amount || 0), 0)

      // Taux conversion devis → commande
      const totalDevis = quotesRes.count || 0
      const devisConverties = ordersFromQuoteRes.count || 0
      const tauxConversion = totalDevis > 0 ? Math.round((devisConverties / totalDevis) * 100) : 0

      setStats({
        caMois,
        beneficeMois,
        commandesEnCours: ordersInProgress.length,
        livraisonsAFaire: deliveries.length,
        acomptesEnAttente,
        soldesARecuperer,
        tauxConversion,
        margeMoyenne
      })

      setRecentOrders(recentOrdersRes.data || [])
    } catch (err) {
      console.error('[Dashboard] Erreur chargement données:', err.message, err)
    } finally {
      setLoading(false)
    }
  }

  const ORDER_STATUS_MAP = {
    brouillon:  { label: 'Brouillon',   bg: 'bg-gray-100',    text: 'text-gray-600' },
    confirme:   { label: 'Confirme',    bg: 'bg-blue-100',    text: 'text-blue-600' },
    en_cours:   { label: 'En cours',    bg: 'bg-yellow-100',  text: 'text-yellow-700' },
    livre:      { label: 'Livre',       bg: 'bg-indigo-100',  text: 'text-indigo-600' },
    termine:    { label: 'Termine',     bg: 'bg-green-100',   text: 'text-green-600' },
    annule:     { label: 'Annule',      bg: 'bg-red-100',     text: 'text-red-600' }
  }

  const StatCard = ({ icon, label, value, sub, color, bgColor, onClick }) => (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-5 shadow-lg border border-gray-100 transition-all ${onClick ? 'cursor-pointer hover:shadow-xl hover:scale-[1.02]' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl ${bgColor} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className={`text-2xl font-bold ${color} leading-tight`}>{value}</p>
      <p className="text-gray-500 text-sm font-medium mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )

  const ActionCard = ({ icon, title, description, onClick, gradient }) => (
    <button
      onClick={onClick}
      className={`w-full p-6 rounded-2xl text-left transition-all hover:scale-[1.02] hover:shadow-xl ${gradient}`}
    >
      <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-white/80 text-sm">{description}</p>
    </button>
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Utilisateur'

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Early access banner */}
      {isEarlyAccess && (
        <div className="mb-6 bg-gradient-to-r from-[#313ADF] to-purple-600 rounded-2xl p-4 flex items-center gap-3 text-white shadow-lg">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-sm font-medium">
            Bienvenue en acces anticipe ! Lancement officiel le 1er mars 2026.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-[#040741] mb-2">
          Bonjour, {userName} !
        </h1>
        <p className="text-gray-500 text-lg">
          Bienvenue sur votre tableau de bord — {workspace?.name || ''}
        </p>
      </div>

      {isLivreur ? (
        /* Vue livreur simplifiée */
        <div className="max-w-md">
          <div className="grid grid-cols-1 gap-4 mb-8">
            <StatCard
              icon={<svg className="w-5 h-5 text-[#040741]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
              label="Livraisons a effectuer"
              value={stats.livraisonsAFaire}
              bgColor="bg-[#040741]/10"
              color="text-[#040741]"
              onClick={() => navigate('/livraisons')}
            />
          </div>
          <ActionCard
            icon={<svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
            title="Mes livraisons"
            description="Voir mes livraisons du jour"
            onClick={() => navigate('/livraisons')}
            gradient="bg-gradient-to-br from-[#040741] to-[#313ADF]"
          />
        </div>
      ) : (
        <>
          {/* KPI Ligne 1 — 4 cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard
              icon={<svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              label="CA du mois"
              value={`${stats.caMois.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
              sub="Commandes terminees"
              bgColor="bg-green-100"
              color="text-green-700"
              onClick={() => navigate('/dashboard-financier')}
            />
            {canViewMargins ? (
              <StatCard
                icon={<svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                label="Benefice du mois"
                value={`${stats.beneficeMois.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
                sub={`Marge ${stats.margeMoyenne.toFixed(0)}%`}
                bgColor="bg-emerald-100"
                color="text-emerald-700"
                onClick={() => navigate('/dashboard-financier')}
              />
            ) : (
              <StatCard
                icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                label="Taux conversion"
                value={`${stats.tauxConversion}%`}
                sub="Devis convertis en vente"
                bgColor="bg-blue-100"
                color="text-blue-700"
                onClick={() => navigate('/devis')}
              />
            )}
            <StatCard
              icon={<svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
              label="Commandes en cours"
              value={stats.commandesEnCours}
              sub="Confirme + en cours"
              bgColor="bg-[#313ADF]/10"
              color="text-[#313ADF]"
              onClick={() => navigate('/commandes')}
            />
            <StatCard
              icon={<svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
              label="Livraisons a faire"
              value={stats.livraisonsAFaire}
              sub="Non terminees"
              bgColor="bg-orange-100"
              color="text-orange-600"
              onClick={() => navigate('/livraisons')}
            />
          </div>

          {/* KPI Ligne 2 — management only */}
          {canViewMargins && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                icon={<svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                label="Acomptes en attente"
                value={`${stats.acomptesEnAttente.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
                sub="Reste a encaisser"
                bgColor="bg-amber-100"
                color="text-amber-700"
                onClick={() => navigate('/commandes')}
              />
              <StatCard
                icon={<svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                label="Soldes a recuperer"
                value={`${stats.soldesARecuperer.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
                sub="Commandes livrees non soldees"
                bgColor="bg-red-100"
                color="text-red-600"
                onClick={() => navigate('/commandes')}
              />
              <StatCard
                icon={<svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                label="Taux conversion"
                value={`${stats.tauxConversion}%`}
                sub="Devis → commandes"
                bgColor="bg-indigo-100"
                color="text-indigo-700"
                onClick={() => navigate('/devis')}
              />
              <StatCard
                icon={<svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>}
                label="Marge moyenne"
                value={`${stats.margeMoyenne.toFixed(1)}%`}
                sub="Ce mois"
                bgColor="bg-purple-100"
                color="text-purple-700"
                onClick={() => navigate('/dashboard-financier')}
              />
            </div>
          )}

          {/* Actions rapides */}
          <div className="mb-8" data-tour="quick-actions">
            <h2 className="text-xl font-bold text-[#040741] mb-4">Actions rapides</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <ActionCard
                icon={<svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                title="Vente rapide"
                description="Encaisser rapidement"
                onClick={() => navigate('/vente-rapide')}
                gradient="bg-gradient-to-br from-green-500 to-emerald-700"
              />
              <ActionCard
                icon={<svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
                title="Nouvelle commande"
                description="Créer une commande client"
                onClick={() => navigate('/commandes/nouvelle')}
                gradient="bg-gradient-to-br from-[#313ADF] to-[#040741]"
              />
              <ActionCard
                icon={<svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                title="Clients"
                description="Gérer le CRM"
                onClick={() => navigate('/clients')}
                gradient="bg-gradient-to-br from-[#4f46e5] to-[#313ADF]"
              />
              <ActionCard
                icon={<svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
                title="Livraisons"
                description="Planifier et suivre"
                onClick={() => navigate('/livraisons')}
                gradient="bg-gradient-to-br from-[#040741] to-[#1a1a5e]"
              />
            </div>
          </div>

          {/* Dernières commandes */}
          {recentOrders.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[#040741]">Dernieres commandes</h2>
                <button
                  onClick={() => navigate('/commandes')}
                  className="text-[#313ADF] font-medium text-sm hover:underline"
                >
                  Voir tout →
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {recentOrders.map((o) => {
                    const statusConf = ORDER_STATUS_MAP[o.status] || { label: o.status, bg: 'bg-gray-100', text: 'text-gray-600' }
                    const clientName = o.customer
                      ? `${o.customer.first_name} ${o.customer.last_name}`
                      : 'Client comptoir'
                    const paidPct = o.total_ttc > 0 ? Math.min(100, ((o.amount_paid || 0) / o.total_ttc) * 100) : 0
                    return (
                      <div
                        key={o.id}
                        onClick={() => navigate(`/commandes/${o.id}`)}
                        className="px-6 py-4 hover:bg-[#313ADF]/5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#313ADF]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                              </svg>
                            </div>
                            <div>
                              <p className="font-bold text-[#040741] text-sm">{o.order_number || `CMD-${o.id?.slice(0, 6)}`}</p>
                              <p className="text-xs text-gray-500">
                                {clientName} · {new Date(o.created_at).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-bold text-[#313ADF] text-sm">{(o.total_ttc || 0).toFixed(2)} €</p>
                              {(o.remaining_amount || 0) > 0 && (
                                <p className="text-xs text-orange-500">
                                  Reste {(o.remaining_amount || 0).toFixed(2)} €
                                </p>
                              )}
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusConf.bg} ${statusConf.text}`}>
                              {statusConf.label}
                            </span>
                          </div>
                        </div>
                        {/* Barre progression paiement */}
                        {o.total_ttc > 0 && (
                          <div className="mt-2 ml-13">
                            <div className="w-full bg-gray-100 rounded-full h-1.5 ml-13">
                              <div
                                className="h-1.5 rounded-full bg-[#313ADF] transition-all"
                                style={{ width: `${paidPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Footer branding */}
          <div className="bg-gradient-to-r from-[#040741] to-[#313ADF] rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold">{workspace?.name || 'Application'}</p>
                  <p className="text-white/70 text-sm">Propulse par Neoflow Agency</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/documentation')}
                className="flex items-center gap-2 px-4 py-2 bg-white/15 rounded-xl hover:bg-white/25 transition-colors text-sm font-medium flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Aide
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
