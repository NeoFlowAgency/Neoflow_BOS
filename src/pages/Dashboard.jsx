import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getStockAlerts } from '../services/stockService'

// ─── Helpers ────────────────────────────────────────────────────────────────

const ORDER_STATUS_MAP = {
  brouillon:      { label: 'Brouillon',      bg: 'bg-gray-100',   text: 'text-gray-600'   },
  confirme:       { label: 'Confirmé',       bg: 'bg-blue-100',   text: 'text-blue-600'   },
  en_preparation: { label: 'En préparation', bg: 'bg-gray-100', text: 'text-orange-700' },
  en_livraison:   { label: 'En livraison',   bg: 'bg-yellow-100', text: 'text-yellow-700' },
  en_cours:       { label: 'En cours',       bg: 'bg-yellow-100', text: 'text-yellow-700' },
  livre:          { label: 'Livré',          bg: 'bg-[#313ADF]/10', text: 'text-[#313ADF]' },
  termine:        { label: 'Terminé',        bg: 'bg-green-100',  text: 'text-green-600'  },
  annule:         { label: 'Annulé',         bg: 'bg-red-100',    text: 'text-red-600'    },
}

function todayRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
  return { start, end }
}

function monthRange() {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
  }
}

function weekRange() {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday.toISOString(), end: sunday.toISOString() }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color, bgColor, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.02]' : ''}`}
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
}

function ActionCard({ icon, title, description, onClick, gradient }) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-5 rounded-2xl text-left transition-all hover:scale-[1.02] hover:shadow-lg ${gradient}`}
    >
      <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-base font-bold text-white mb-1">{title}</h3>
      <p className="text-white/75 text-xs">{description}</p>
    </button>
  )
}

function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <div className="space-y-2 mb-6">
      {alerts.map((a, i) => (
        <div
          key={i}
          onClick={a.onClick}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${a.onClick ? 'cursor-pointer' : ''}
            ${a.type === 'error'   ? 'bg-red-50 border-red-200 text-red-700'    : ''}
            ${a.type === 'warning' ? 'bg-orange-50 border-orange-200 text-orange-700' : ''}
            ${a.type === 'info'    ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
          `}
        >
          <span className="flex-shrink-0">
            {a.type === 'error'   && '🔴'}
            {a.type === 'warning' && '⚠️'}
            {a.type === 'info'    && 'ℹ️'}
          </span>
          <span className="flex-1">{a.message}</span>
          {a.onClick && <span className="text-xs opacity-60">→</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading, isLivreur, role } = useWorkspace()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // KPIs mensuels
  const [stats, setStats] = useState({
    caMois: 0, beneficeMois: 0, commandesEnCours: 0, livraisonsAFaire: 0,
    acomptesEnAttente: 0, soldesARecuperer: 0, tauxConversion: 0, margeMoyenne: 0,
  })

  // Aujourd'hui
  const [todayStats, setTodayStats] = useState({ caToday: 0, ventesToday: 0, livraisonsToday: 0 })

  // Activité récente
  const [recentOrders, setRecentOrders] = useState([])
  const [recentPayments, setRecentPayments] = useState([])

  // Agenda livraisons semaine
  const [weekDeliveries, setWeekDeliveries] = useState([])

  // Performance équipe (manager seulement)
  const [teamPerf, setTeamPerf] = useState([])

  // Alertes
  const [alerts, setAlerts] = useState([])

  // SAV urgent
  const [savUrgent, setSavUrgent] = useState(0)

  const canViewMargins = role === 'proprietaire' || role === 'manager'
  const isManager = canViewMargins

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) { setLoading(false); return }
    loadAll()
  }, [workspace?.id, wsLoading])

  const loadAll = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      setUser(currentUser)

      const { start: todayStart, end: todayEnd } = todayRange()
      const { start: monthStart, end: monthEnd } = monthRange()
      const { start: weekStart, end: weekEnd } = weekRange()
      const today = new Date().toISOString().split('T')[0]

      const [
        ordersMonthRes, ordersInProgressRes, deliveriesActiveRes,
        ordersLivresRes, quotesRes, ordersFromQuoteRes,
        recentOrdersRes, recentPaymentsRes,
        weekDeliveriesRes, ordersTodayRes, paymentsTodayRes,
        overdueDeliveriesRes, savUrgentRes,
      ] = await Promise.all([
        // CA du mois
        supabase.from('orders').select('id, total_ttc, subtotal_ht, amount_paid, remaining_amount')
          .eq('workspace_id', workspace.id).eq('status', 'termine')
          .gte('created_at', monthStart).lte('created_at', monthEnd),

        // Commandes en cours
        supabase.from('orders').select('id, status, amount_paid, remaining_amount')
          .eq('workspace_id', workspace.id)
          .in('status', ['confirme', 'en_preparation', 'en_livraison', 'en_cours']),

        // Livraisons actives
        supabase.from('deliveries').select('id, status')
          .eq('workspace_id', workspace.id).not('status', 'in', '("livree","annulee")'),

        // Soldes à récupérer
        supabase.from('orders').select('id, remaining_amount')
          .eq('workspace_id', workspace.id).eq('status', 'livre').gt('remaining_amount', 0),

        // Total devis
        supabase.from('quotes').select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id),

        // Devis convertis
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id).eq('source', 'from_quote'),

        // Dernières commandes
        supabase.from('orders')
          .select('id, order_number, total_ttc, amount_paid, remaining_amount, status, created_at, customer:customers(first_name, last_name)')
          .eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(6),

        // Derniers paiements
        supabase.from('payments')
          .select('id, amount, payment_method, payment_date, order:orders(order_number, customer:customers(first_name, last_name))')
          .eq('workspace_id', workspace.id).order('payment_date', { ascending: false }).limit(5),

        // Livraisons de la semaine
        supabase.from('deliveries')
          .select('id, status, scheduled_date, time_slot, delivery_address, assigned_to, order:orders(order_number, customer:customers(first_name, last_name, phone))')
          .eq('workspace_id', workspace.id).not('status', 'in', '("annulee")')
          .gte('scheduled_date', weekStart.split('T')[0]).lte('scheduled_date', weekEnd.split('T')[0])
          .order('scheduled_date', { ascending: true }),

        // Commandes terminées aujourd'hui
        supabase.from('orders').select('id, total_ttc')
          .eq('workspace_id', workspace.id).eq('status', 'termine')
          .gte('created_at', todayStart).lte('created_at', todayEnd),

        // Paiements encaissés aujourd'hui
        supabase.from('payments').select('id, amount')
          .eq('workspace_id', workspace.id)
          .gte('payment_date', todayStart.split('T')[0]).lte('payment_date', todayEnd.split('T')[0]),

        // Livraisons en retard (planifiée mais date dépassée)
        supabase.from('deliveries').select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id).in('status', ['planifiee', 'a_planifier'])
          .lt('scheduled_date', today),

        // SAV tickets urgents ouverts
        supabase.from('sav_tickets').select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspace.id).eq('priority', 'urgente')
          .in('status', ['ouvert', 'en_cours']),
      ])

      // === Calculs mensuels ===
      const ordersMonth = ordersMonthRes.data || []
      const ordersInProgress = ordersInProgressRes.data || []

      let orderItemsMargin = []
      if (canViewMargins && ordersMonth.length > 0) {
        const { data: items } = await supabase.from('order_items')
          .select('quantity, unit_price_ht, cost_price_ht, order_id')
          .in('order_id', ordersMonth.map(o => o.id))
        orderItemsMargin = items || []
      }

      const caMois = ordersMonth.reduce((s, o) => s + (o.total_ttc || 0), 0)
      const caHtMois = ordersMonth.reduce((s, o) => s + (o.subtotal_ht || 0), 0)
      const coutsMois = orderItemsMargin.reduce((s, i) => s + (i.cost_price_ht || 0) * (i.quantity || 0), 0)
      const beneficeMois = caHtMois - coutsMois
      const margeMoyenne = caHtMois > 0 ? ((caHtMois - coutsMois) / caHtMois) * 100 : 0

      const acomptesEnAttente = ordersInProgress
        .filter(o => (o.amount_paid || 0) > 0 && (o.remaining_amount || 0) > 0)
        .reduce((s, o) => s + (o.remaining_amount || 0), 0)
      const soldesARecuperer = (ordersLivresRes.data || []).reduce((s, o) => s + (o.remaining_amount || 0), 0)
      const totalDevis = quotesRes.count || 0
      const devisConverties = ordersFromQuoteRes.count || 0
      const tauxConversion = totalDevis > 0 ? Math.round((devisConverties / totalDevis) * 100) : 0

      setStats({
        caMois, beneficeMois, margeMoyenne, tauxConversion,
        commandesEnCours: ordersInProgress.length,
        livraisonsAFaire: (deliveriesActiveRes.data || []).length,
        acomptesEnAttente, soldesARecuperer,
      })

      // === Aujourd'hui ===
      const ventesToday = (ordersTodayRes.data || []).length
      const caTodayVentes = (ordersTodayRes.data || []).reduce((s, o) => s + (o.total_ttc || 0), 0)
      const caToday = (paymentsTodayRes.data || []).reduce((s, p) => s + (p.amount || 0), 0)
      const livraisonsToday = (weekDeliveriesRes.data || [])
        .filter(d => d.scheduled_date === today).length

      setTodayStats({ caToday, ventesToday, livraisonsToday })

      setRecentOrders(recentOrdersRes.data || [])
      setRecentPayments(recentPaymentsRes.data || [])
      setWeekDeliveries(weekDeliveriesRes.data || [])
      setSavUrgent(savUrgentRes.count || 0)

      // === Alertes ===
      const newAlerts = []
      const overdue = overdueDeliveriesRes.count || 0
      if (overdue > 0) {
        newAlerts.push({
          type: 'error',
          message: `${overdue} livraison${overdue > 1 ? 's' : ''} en retard — date dépassée`,
          onClick: () => navigate('/livraisons'),
        })
      }
      if (savUrgentRes.count > 0) {
        newAlerts.push({
          type: 'error',
          message: `${savUrgentRes.count} ticket${savUrgentRes.count > 1 ? 's' : ''} SAV urgent${savUrgentRes.count > 1 ? 's' : ''} en attente`,
          onClick: () => navigate('/sav'),
        })
      }
      if (soldesARecuperer > 500) {
        newAlerts.push({
          type: 'warning',
          message: `${soldesARecuperer.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € de soldes à récupérer sur des commandes livrées`,
          onClick: () => navigate('/commandes'),
        })
      }

      // Alertes stock (par emplacement)
      try {
        const stockAlerts = await getStockAlerts(workspace.id)
        if (stockAlerts.length > 0) {
          newAlerts.push({
            type: 'warning',
            message: `${stockAlerts.length} alerte${stockAlerts.length > 1 ? 's' : ''} stock bas — ${stockAlerts.slice(0, 2).map(a => a.product_name || a.description).join(', ')}${stockAlerts.length > 2 ? '…' : ''}`,
            onClick: () => navigate('/stock'),
          })
        }
      } catch (_) {}

      setAlerts(newAlerts)

      // === Performance équipe (manager) ===
      if (isManager) {
        const { data: teamOrders } = await supabase
          .from('orders')
          .select('created_by, total_ttc')
          .eq('workspace_id', workspace.id)
          .gte('created_at', monthStart)
          .lte('created_at', monthEnd)
          .not('status', 'eq', 'annule')

        const { data: members } = await supabase
          .from('workspace_users')
          .select('user_id, role')
          .eq('workspace_id', workspace.id)
          .in('role', ['proprietaire', 'manager', 'vendeur'])

        const userIds = (members || []).map(m => m.user_id).filter(Boolean)
        let profilesMap = {}
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles').select('id, full_name').in('id', userIds)
          ;(profiles || []).forEach(p => { profilesMap[p.id] = p.full_name })
        }

        const byUser = {}
        ;(teamOrders || []).forEach(o => {
          const uid = o.created_by
          if (!uid) return
          if (!byUser[uid]) byUser[uid] = { name: profilesMap[uid] || 'Membre', ca: 0, count: 0 }
          byUser[uid].ca += o.total_ttc || 0
          byUser[uid].count++
        })

        const sorted = Object.values(byUser).sort((a, b) => b.ca - a.ca)
        setTeamPerf(sorted)
      }
    } catch (err) {
      console.error('[Dashboard] Erreur:', err)
    } finally {
      setLoading(false)
    }
  }

  const PAYMENT_METHOD_LABELS = {
    cash: 'Espèces', card: 'Carte', check: 'Chèque', bank_transfer: 'Virement',
  }

  const DELIVERY_STATUS_DOT = {
    a_planifier: 'bg-gray-400', planifiee: 'bg-blue-400',
    en_cours: 'bg-yellow-400', livree: 'bg-green-400',
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent" />
      </div>
    )
  }

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Utilisateur'
  const today = new Date()

  // ── Vue LIVREUR ──────────────────────────────────────────────────────────
  if (isLivreur) {
    return (
      <div className="p-4 md:p-8 min-h-screen">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#040741]">Bonjour, {userName} !</h1>
          <p className="text-gray-500 text-sm mt-1">
            {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 max-w-sm">
          <StatCard
            icon={<svg className="w-5 h-5 text-[#040741]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
            label="Livraisons à faire"
            value={stats.livraisonsAFaire}
            bgColor="bg-[#040741]/10"
            color="text-[#040741]"
            onClick={() => navigate('/livraisons/ma-journee')}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
          <ActionCard
            icon={<svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
            title="Ma journée"
            description="Vue mobile optimisée"
            onClick={() => navigate('/livraisons/ma-journee')}
            gradient="bg-gradient-to-br from-[#313ADF] to-[#040741]"
          />
          <ActionCard
            icon={<svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
            title="Kanban livraisons"
            description="Vue tableau complète"
            onClick={() => navigate('/livraisons')}
            gradient="bg-gradient-to-br from-gray-600 to-gray-800"
          />
        </div>
      </div>
    )
  }

  // ── Vue MANAGER / PROPRIÉTAIRE / VENDEUR ─────────────────────────────────
  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">
            Bonjour, {userName} !
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {workspace?.name}
          </p>
        </div>
        <button
          onClick={() => navigate('/vente-rapide')}
          className="flex items-center gap-2 bg-[#313ADF] text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-[#040741] transition-colors shadow-sm flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="hidden sm:inline">Vente rapide</span>
          <span className="sm:hidden">Vente</span>
        </button>
      </div>

      {/* ── Alertes critiques ────────────────────────────── */}
      <AlertBanner alerts={alerts} />

      {/* ── Aujourd'hui ──────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-base font-bold text-[#040741] mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Aujourd'hui
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-700">
              {todayStats.caToday.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </p>
            <p className="text-xs text-gray-500 mt-1">Encaissé</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-[#313ADF]">{todayStats.ventesToday}</p>
            <p className="text-xs text-gray-500 mt-1">Ventes terminées</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-gray-600">{todayStats.livraisonsToday}</p>
            <p className="text-xs text-gray-500 mt-1">Livraisons prévues</p>
          </div>
        </div>
      </div>

      {/* ── KPIs mensuels ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          icon={<svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          label="CA du mois" value={`${stats.caMois.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
          sub="Commandes terminées" bgColor="bg-green-100" color="text-green-700"
          onClick={() => navigate('/dashboard-financier')}
        />
        {canViewMargins ? (
          <StatCard
            icon={<svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            label="Bénéfice du mois" value={`${stats.beneficeMois.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
            sub={`Marge ${stats.margeMoyenne.toFixed(0)}%`} bgColor="bg-green-100" color="text-green-700"
            onClick={() => navigate('/dashboard-financier')}
          />
        ) : (
          <StatCard
            icon={<svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
            label="Taux conversion" value={`${stats.tauxConversion}%`}
            sub="Devis convertis" bgColor="bg-blue-100" color="text-blue-700"
            onClick={() => navigate('/devis')}
          />
        )}
        <StatCard
          icon={<svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
          label="Commandes en cours" value={stats.commandesEnCours}
          sub="Confirmé + en cours" bgColor="bg-[#313ADF]/10" color="text-[#313ADF]"
          onClick={() => navigate('/commandes')}
        />
        <StatCard
          icon={<svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>}
          label="Livraisons à faire" value={stats.livraisonsAFaire}
          sub="Non terminées" bgColor="bg-gray-100" color="text-gray-600"
          onClick={() => navigate('/livraisons')}
        />
      </div>

      {/* KPIs management ligne 2 */}
      {canViewMargins && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            icon={<svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            label="Acomptes en attente" value={`${stats.acomptesEnAttente.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
            sub="Reste à encaisser" bgColor="bg-[#313ADF]/10" color="text-[#313ADF]"
            onClick={() => navigate('/commandes')}
          />
          <StatCard
            icon={<svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            label="Soldes à récupérer" value={`${stats.soldesARecuperer.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
            sub="Livrées non soldées" bgColor="bg-red-100" color="text-red-600"
            onClick={() => navigate('/commandes')}
          />
          <StatCard
            icon={<svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            label="Taux conversion" value={`${stats.tauxConversion}%`}
            sub="Devis → commandes" bgColor="bg-[#313ADF]/10" color="text-[#313ADF]"
            onClick={() => navigate('/devis')}
          />
          <StatCard
            icon={<svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>}
            label="Marge moyenne" value={`${stats.margeMoyenne.toFixed(1)}%`}
            sub="Ce mois" bgColor="bg-green-100" color="text-green-700"
            onClick={() => navigate('/dashboard-financier')}
          />
        </div>
      )}

      {/* ── Actions rapides ───────────────────────────────── */}
      <div className="mb-8" data-tour="quick-actions">
        <h2 className="text-base font-bold text-[#040741] mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ActionCard
            icon={<svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            title="Vente rapide" description="Encaisser maintenant"
            onClick={() => navigate('/vente-rapide')}
            gradient="bg-gradient-to-br from-[#16a34a] to-[#15803d]"
          />
          <ActionCard
            icon={<svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>}
            title="Nouvelle commande" description="Créer une commande"
            onClick={() => navigate('/commandes/nouvelle')}
            gradient="bg-gradient-to-br from-[#313ADF] to-[#040741]"
          />
          <ActionCard
            icon={<svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            title="Clients" description="Gérer le CRM"
            onClick={() => navigate('/clients')}
            gradient="bg-gradient-to-br from-gray-700 to-gray-900"
          />
          <ActionCard
            icon={<svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
            title="SAV" description={savUrgent > 0 ? `${savUrgent} ticket(s) urgent(s)` : 'Gérer les retours'}
            onClick={() => navigate('/sav')}
            gradient={savUrgent > 0 ? 'bg-gradient-to-br from-red-500 to-red-700' : 'bg-gradient-to-br from-gray-700 to-gray-900'}
          />
        </div>
      </div>

      {/* ── Grille principale ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Dernières commandes (2/3) */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#040741]">Dernières commandes</h2>
            <button onClick={() => navigate('/commandes')} className="text-[#313ADF] text-xs font-medium hover:underline">Voir tout →</button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {recentOrders.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune commande</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentOrders.map(o => {
                  const sc = ORDER_STATUS_MAP[o.status] || { label: o.status, bg: 'bg-gray-100', text: 'text-gray-600' }
                  const client = o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Client comptoir'
                  const paidPct = o.total_ttc > 0 ? Math.min(100, ((o.amount_paid || 0) / o.total_ttc) * 100) : 0
                  return (
                    <div key={o.id} onClick={() => navigate(`/commandes/${o.id}`)}
                      className="px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-[#040741] text-sm truncate">{o.order_number}</p>
                          <p className="text-xs text-gray-400">{client} · {new Date(o.created_at).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="font-bold text-[#313ADF] text-sm">{(o.total_ttc || 0).toFixed(0)} €</p>
                            {(o.remaining_amount || 0) > 0 && (
                              <p className="text-xs text-gray-600">Reste {(o.remaining_amount || 0).toFixed(0)} €</p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${sc.bg} ${sc.text}`}>{sc.label}</span>
                        </div>
                      </div>
                      {o.total_ttc > 0 && (
                        <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1">
                          <div className="h-1 rounded-full bg-[#313ADF]" style={{ width: `${paidPct}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Derniers paiements (1/3) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#040741]">Paiements récents</h2>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {recentPayments.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucun paiement</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {recentPayments.map(p => {
                  const client = p.order?.customer
                    ? `${p.order.customer.first_name} ${p.order.customer.last_name}`
                    : 'Client comptoir'
                  return (
                    <div key={p.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-green-700">+{(p.amount || 0).toFixed(0)} €</p>
                          <p className="text-xs text-gray-400 truncate">{client}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(p.payment_date).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Grille secondaire ─────────────────────────────── */}
      <div className={`grid grid-cols-1 ${isManager && teamPerf.length > 0 ? 'lg:grid-cols-2' : ''} gap-6 mb-6`}>

        {/* Agenda livraisons de la semaine */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-[#040741]">Livraisons cette semaine</h2>
            <button onClick={() => navigate('/livraisons')} className="text-[#313ADF] text-xs font-medium hover:underline">Gérer →</button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {weekDeliveries.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune livraison planifiée cette semaine</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {weekDeliveries.slice(0, 6).map(d => {
                  const client = d.order?.customer
                    ? `${d.order.customer.first_name} ${d.order.customer.last_name}`
                    : 'Client'
                  const dotColor = DELIVERY_STATUS_DOT[d.status] || 'bg-gray-300'
                  const isToday = d.scheduled_date === new Date().toISOString().split('T')[0]
                  return (
                    <div key={d.id} onClick={() => navigate('/livraisons')}
                      className={`px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${isToday ? 'bg-blue-50/50' : ''}`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#040741] truncate">{client}</p>
                        <p className="text-xs text-gray-400">
                          {new Date(d.scheduled_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {d.time_slot && ` · ${d.time_slot}`}
                        </p>
                      </div>
                      {isToday && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full flex-shrink-0">Aujourd'hui</span>}
                    </div>
                  )
                })}
                {weekDeliveries.length > 6 && (
                  <p className="text-center text-gray-400 text-xs py-2">+{weekDeliveries.length - 6} autres</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Performance équipe (manager) */}
        {isManager && teamPerf.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[#040741]">Performance équipe</h2>
              <span className="text-xs text-gray-400">Ce mois</span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-4 space-y-3">
              {teamPerf.map((member, i) => {
                const maxCA = teamPerf[0].ca || 1
                const pct = (member.ca / maxCA) * 100
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#313ADF]/10 flex items-center justify-center text-xs font-bold text-[#313ADF]">
                          {(member.name || '?')[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-[#040741]">{member.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-[#313ADF]">{member.ca.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</span>
                        <span className="text-xs text-gray-400 ml-2">{member.count} vente{member.count > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-gradient-to-r from-[#313ADF] to-[#4149e8] transition-all"
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gradient-to-r from-[#040741] to-[#313ADF] rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm">{workspace?.name}</p>
              <p className="text-white/60 text-xs">Propulsé par Neoflow Agency</p>
            </div>
          </div>
          <button onClick={() => navigate('/documentation')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 rounded-xl hover:bg-white/25 transition-colors text-xs font-medium flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Aide
          </button>
        </div>
      </div>
    </div>
  )
}
