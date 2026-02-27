import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import ChartModal from '../components/ui/ChartModal'

const COLORS = {
  brouillon: '#6B7280',
  confirme: '#313ADF',
  en_cours: '#F59E0B',
  livre: '#8B5CF6',
  termine: '#10B981',
  annule: '#EF4444'
}

const SELLER_COLORS = ['#313ADF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

export default function DashboardFinancier() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading, role } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const canViewMargins = role === 'proprietaire' || role === 'manager'

  const [periodeCA, setPeriodeCA] = useState('mois')
  const [fullscreenChart, setFullscreenChart] = useState(null)

  const [stats, setStats] = useState({
    caTotal: 0,
    totalCommandes: 0,
    commandesTerminees: 0,
    livraisonsEnRetard: 0
  })

  const [ordersTerminesRaw, setOrdersTerminesRaw] = useState([])
  const [repartitionStatut, setRepartitionStatut] = useState([])
  const [dernieresCommandes, setDernieresCommandes] = useState([])
  const [topProduits, setTopProduits] = useState([])
  const [flopProduits, setFlopProduits] = useState([])
  const [vendeurs, setVendeurs] = useState([])
  const [margesProduits, setMargesProduits] = useState([])
  const [produitsInactifs, setProduitsInactifs] = useState([])
  const [stockResume, setStockResume] = useState({ valeurTotale: 0, nbAlertes: 0 })
  const [livraisonsRetardList, setLivraisonsRetardList] = useState([])

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    fetchDashboardData()
  }, [workspace?.id, wsLoading])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

      // 1. Orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, total_ttc, subtotal_ht, status, created_at, created_by, customer:customers(first_name, last_name)')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })

      if (ordersError) throw ordersError

      // 2. Deliveries
      const { data: deliveriesData } = await supabase
        .from('deliveries')
        .select('id, status, scheduled_date, delivery_address, order:orders(order_number, customer:customers(first_name, last_name))')
        .eq('workspace_id', workspace.id)

      // 3. Workspace members + profiles
      const { data: membersData } = await supabase
        .from('workspace_users')
        .select('user_id, role')
        .eq('workspace_id', workspace.id)

      const orders = ordersData || []
      const deliveries = deliveriesData || []
      const members = membersData || []

      const memberUserIds = members.map(m => m.user_id).filter(Boolean)
      let profilesMap = {}
      if (memberUserIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', memberUserIds)
        if (profilesData) {
          profilesData.forEach(p => { profilesMap[p.id] = p.full_name })
        }
      }

      const ordersTermines = orders.filter(o => o.status === 'termine')
      const caTotal = ordersTermines.reduce((sum, o) => sum + (parseFloat(o.total_ttc) || 0), 0)

      setStats({
        caTotal,
        totalCommandes: orders.length,
        commandesTerminees: ordersTermines.length,
        livraisonsEnRetard: deliveries.filter(d => {
          if (!d.scheduled_date || d.status === 'livree' || d.status === 'annulee') return false
          return new Date(d.scheduled_date) < now
        }).length
      })

      setOrdersTerminesRaw(ordersTermines)
      setDernieresCommandes(ordersTermines.slice(0, 10))

      // Livraisons en retard
      const retard = deliveries.filter(d => {
        if (!d.scheduled_date || d.status === 'livree' || d.status === 'annulee') return false
        return new Date(d.scheduled_date) < now
      })
      setLivraisonsRetardList(retard)

      // Repartition par statut (orders)
      const statutCounts = { brouillon: 0, confirme: 0, en_cours: 0, livre: 0, termine: 0, annule: 0 }
      orders.forEach(o => {
        if (statutCounts[o.status] !== undefined) statutCounts[o.status]++
      })
      setRepartitionStatut([
        { name: 'Brouillon',  value: statutCounts.brouillon,  color: COLORS.brouillon },
        { name: 'Confirme',   value: statutCounts.confirme,   color: COLORS.confirme },
        { name: 'En cours',   value: statutCounts.en_cours,   color: COLORS.en_cours },
        { name: 'Livre',      value: statutCounts.livre,      color: COLORS.livre },
        { name: 'Termine',    value: statutCounts.termine,    color: COLORS.termine },
        { name: 'Annule',     value: statutCounts.annule,     color: COLORS.annule }
      ].filter(item => item.value > 0))

      // Order items for product + margin stats
      const termineIds = ordersTermines.map(o => o.id)
      let items = []
      let allRecentItems = []
      if (termineIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('order_items')
          .select('product_id, description, quantity, unit_price_ht, cost_price_ht, total_ht')
          .in('order_id', termineIds)
        items = itemsData || []
      }

      // All order items in last 30 days (for faible rotation)
      const { data: recentItemsData } = await supabase
        .from('order_items')
        .select('product_id')
        .in('order_id',
          orders.filter(o => o.created_at >= thirtyDaysAgo).map(o => o.id)
        )
      allRecentItems = recentItemsData || []

      // Products ranking by volume
      const prodMap = {}
      items.forEach(item => {
        const key = item.product_id || item.description || 'Autre'
        if (!prodMap[key]) {
          prodMap[key] = {
            name: item.description || 'Produit inconnu',
            quantity: 0,
            ca: 0,
            caHt: 0,
            cout: 0
          }
        }
        prodMap[key].quantity += parseInt(item.quantity) || 0
        prodMap[key].ca += parseFloat(item.total_ht) || 0
        prodMap[key].caHt += (parseFloat(item.unit_price_ht) || 0) * (parseInt(item.quantity) || 0)
        prodMap[key].cout += (parseFloat(item.cost_price_ht) || 0) * (parseInt(item.quantity) || 0)
      })
      const prodList = Object.values(prodMap).sort((a, b) => b.quantity - a.quantity)
      const top = prodList.slice(0, 5)
      setTopProduits(top)
      if (prodList.length > top.length) {
        const topNames = new Set(top.map(p => p.name))
        const flop = [...prodList].sort((a, b) => a.quantity - b.quantity).filter(p => !topNames.has(p.name)).slice(0, 5)
        setFlopProduits(flop)
      } else {
        setFlopProduits([])
      }

      // Marges par produit (management only)
      if (canViewMargins) {
        const prodWithMargin = Object.values(prodMap)
          .filter(p => p.cout > 0)
          .map(p => ({
            name: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name,
            marge: p.caHt > 0 ? Math.round(((p.caHt - p.cout) / p.caHt) * 100) : 0,
            benefice: Math.round(p.caHt - p.cout),
            ca: Math.round(p.caHt)
          }))
          .sort((a, b) => b.benefice - a.benefice)
          .slice(0, 10)
        setMargesProduits(prodWithMargin)
      }

      // Vendeurs (from orders)
      const memberMap = {}
      members.forEach(m => {
        memberMap[m.user_id] = profilesMap[m.user_id] || 'Utilisateur'
      })
      const sellerMap = {}
      orders.forEach(order => {
        const uid = order.created_by
        if (!uid) return
        if (!sellerMap[uid]) {
          sellerMap[uid] = { name: memberMap[uid] || 'Vendeur', nbCommandes: 0, ca: 0 }
        }
        sellerMap[uid].nbCommandes++
        if (order.status === 'termine') {
          sellerMap[uid].ca += parseFloat(order.total_ttc) || 0
        }
      })
      setVendeurs(Object.values(sellerMap).sort((a, b) => b.ca - a.ca))

      // Produits faible rotation (not sold in last 30 days)
      const recentProductIds = new Set(allRecentItems.map(i => i.product_id).filter(Boolean))
      const { data: allProductsData } = await supabase
        .from('products')
        .select('id, name, reference')
        .eq('workspace_id', workspace.id)
        .eq('is_archived', false)

      if (allProductsData) {
        const inactifs = allProductsData
          .filter(p => !recentProductIds.has(p.id))
          .slice(0, 8)
        setProduitsInactifs(inactifs)
      }

      // Stock résumé
      const { data: stockData } = await supabase
        .from('stock_levels')
        .select('quantity, product:products(cost_price_ht)')
        .eq('workspace_id', workspace.id)

      if (stockData) {
        const valeurTotale = stockData.reduce((sum, s) => {
          return sum + ((s.quantity || 0) * (s.product?.cost_price_ht || 0))
        }, 0)
        const nbAlertes = stockData.filter(s => (s.quantity || 0) <= 3).length
        setStockResume({ valeurTotale, nbAlertes })
      }

    } catch (err) {
      console.error('Erreur chargement statistiques:', err)
      setError('Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  const getCAParPeriode = () => {
    const now = new Date()
    const joursSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    const moisNoms = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec']

    if (periodeCA === 'jour') {
      const todayStr = now.toISOString().split('T')[0]
      const slots = [
        { label: '00h-06h', min: 0, max: 6, ca: 0 },
        { label: '06h-12h', min: 6, max: 12, ca: 0 },
        { label: '12h-18h', min: 12, max: 18, ca: 0 },
        { label: '18h-00h', min: 18, max: 24, ca: 0 }
      ]
      ordersTerminesRaw.forEach(o => {
        if (!o.created_at) return
        const d = new Date(o.created_at)
        if (d.toISOString().split('T')[0] === todayStr) {
          const h = d.getHours()
          const slot = slots.find(s => h >= s.min && h < s.max)
          if (slot) slot.ca += parseFloat(o.total_ttc) || 0
        }
      })
      return slots.map(s => ({ mois: s.label, ca: Math.round(s.ca * 100) / 100 }))
    }

    if (periodeCA === 'semaine') {
      const data = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const dayStr = d.toISOString().split('T')[0]
        let ca = 0
        ordersTerminesRaw.forEach(o => {
          if (o.created_at && new Date(o.created_at).toISOString().split('T')[0] === dayStr) {
            ca += parseFloat(o.total_ttc) || 0
          }
        })
        data.push({ mois: `${joursSemaine[d.getDay()]} ${d.getDate()}`, ca: Math.round(ca * 100) / 100 })
      }
      return data
    }

    if (periodeCA === 'mois') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const data = []
      for (let week = 0; week < 5; week++) {
        const weekStart = new Date(firstDay.getTime() + week * 7 * 86400000)
        if (weekStart.getMonth() !== now.getMonth() && week > 0) break
        const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)
        let ca = 0
        ordersTerminesRaw.forEach(o => {
          if (!o.created_at) return
          const d = new Date(o.created_at)
          if (d >= weekStart && d < weekEnd && d.getMonth() === now.getMonth()) {
            ca += parseFloat(o.total_ttc) || 0
          }
        })
        data.push({ mois: `Sem ${week + 1}`, ca: Math.round(ca * 100) / 100 })
      }
      return data
    }

    if (periodeCA === 'trimestre') {
      const data = []
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        let ca = 0
        ordersTerminesRaw.forEach(o => {
          if (!o.created_at) return
          const fd = new Date(o.created_at)
          if (fd >= d && fd < nextMonth) ca += parseFloat(o.total_ttc) || 0
        })
        data.push({ mois: `${moisNoms[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, ca: Math.round(ca * 100) / 100 })
      }
      return data
    }

    // annee: last 12 months
    const data = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      let ca = 0
      ordersTerminesRaw.forEach(o => {
        if (!o.created_at) return
        const fd = new Date(o.created_at)
        if (fd >= d && fd < nextMonth) ca += parseFloat(o.total_ttc) || 0
      })
      data.push({ mois: `${moisNoms[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, ca: Math.round(ca * 100) / 100 })
    }
    return data
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent mb-4"></div>
        <p className="text-gray-500">Chargement des donnees...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-xl">
          <p className="font-medium">{error}</p>
          <button onClick={fetchDashboardData} className="mt-2 text-sm underline hover:no-underline">
            Reessayer
          </button>
        </div>
      </div>
    )
  }

  const caParMoisFiltre = getCAParPeriode()

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">Statistiques</h1>
        <p className="text-gray-500">Vue d'ensemble de vos performances commerciales</p>
      </div>

      {/* 4 CARTES KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-[#040741] to-[#313ADF] rounded-2xl p-5 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-white/70 text-sm font-medium">CA Total (terminees)</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats.caTotal)}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Total commandes</span>
          </div>
          <p className="text-2xl font-bold text-[#040741]">{stats.totalCommandes}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Terminees</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.commandesTerminees}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Livraisons en retard</span>
          </div>
          <p className="text-2xl font-bold text-red-500">{stats.livraisonsEnRetard}</p>
        </div>
      </div>

      {/* GRAPHIQUES CA + REPARTITION */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* Graphique CA */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-100 shadow-lg cursor-pointer hover:shadow-xl transition-shadow group" onClick={() => setFullscreenChart('ca')}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-lg font-bold text-[#040741] flex items-center gap-2">
              Evolution du CA
              <svg className="w-4 h-4 text-gray-300 group-hover:text-[#313ADF] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </h3>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'jour', label: 'Jour' },
                { value: 'semaine', label: 'Semaine' },
                { value: 'mois', label: 'Mois' },
                { value: 'trimestre', label: 'Trimestre' },
                { value: 'annee', label: 'Annee' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={(e) => { e.stopPropagation(); setPeriodeCA(option.value) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    periodeCA === option.value
                      ? 'bg-[#313ADF] text-white shadow-md'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-[#313ADF] hover:text-[#313ADF]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {caParMoisFiltre.length > 0 && caParMoisFiltre.some(m => m.ca > 0) ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={caParMoisFiltre} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="mois"
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    axisLine={{ stroke: '#E5E7EB' }}
                    interval={0}
                    angle={periodeCA === 'annee' ? -45 : 0}
                    textAnchor={periodeCA === 'annee' ? 'end' : 'middle'}
                    height={periodeCA === 'annee' ? 60 : 30}
                  />
                  <YAxis
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v}€`}
                    axisLine={{ stroke: '#E5E7EB' }}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), 'CA']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    labelStyle={{ fontWeight: 'bold', color: '#040741' }}
                  />
                  <Bar dataKey="ca" fill="#313ADF" radius={[8, 8, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p>Aucune donnee de CA pour cette periode</p>
              </div>
            </div>
          )}
        </div>

        {/* Repartition par statut commandes */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-lg cursor-pointer hover:shadow-xl transition-shadow group" onClick={() => setFullscreenChart('statut')}>
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            Statuts commandes
            <svg className="w-4 h-4 text-gray-300 group-hover:text-[#313ADF] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </h3>
          {repartitionStatut.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={repartitionStatut}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#6B7280', strokeWidth: 1 }}
                  >
                    {repartitionStatut.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
                <p>Aucune commande disponible</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MARGES PAR PRODUIT (management only) */}
      {canViewMargins && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg mb-8">
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Marge par produit (top 10)
            <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Gestion</span>
          </h3>
          {margesProduits.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={margesProduits} margin={{ top: 10, right: 30, left: 20, bottom: 60 }} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                    axisLine={{ stroke: '#E5E7EB' }}
                    domain={[0, 100]}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    axisLine={{ stroke: '#E5E7EB' }}
                    width={130}
                  />
                  <Tooltip
                    formatter={(value, name) => name === 'marge' ? [`${value}%`, 'Taux de marge'] : [formatCurrency(value), 'Benefice']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                    labelStyle={{ fontWeight: 'bold', color: '#040741' }}
                  />
                  <Bar dataKey="marge" fill="#10B981" radius={[0, 6, 6, 0]} maxBarSize={24}
                    label={{ position: 'right', formatter: (v) => `${v}%`, fill: '#6B7280', fontSize: 11 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-8 text-center text-gray-400">
              <p className="text-sm">Les marges s'afficheront quand des commandes seront terminees avec des couts d'achat renseignes.</p>
            </div>
          )}
        </div>
      )}

      {/* PRODUITS + VENDEURS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Top / Flop Produits */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg cursor-pointer hover:shadow-xl transition-shadow group" onClick={() => setFullscreenChart('produits')}>
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Produits les plus vendus
            <svg className="w-4 h-4 text-gray-300 group-hover:text-[#313ADF] transition-colors ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </h3>
          {topProduits.length > 0 ? (
            <div className="space-y-3">
              {topProduits.map((p, i) => {
                const maxQty = topProduits[0]?.quantity || 1
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-50 text-orange-600'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[#040741] truncate">{p.name}</span>
                        <span className="text-sm font-bold text-[#313ADF] ml-2">{p.quantity} vendus</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-[#313ADF] h-2 rounded-full transition-all"
                          style={{ width: `${(p.quantity / maxQty) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">Aucune donnee produit</p>
          )}

          {flopProduits.length > 0 && (
            <>
              <h4 className="text-md font-bold text-[#040741] mt-6 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
                Moins vendus
              </h4>
              <div className="space-y-2">
                {flopProduits.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600 truncate">{p.name}</span>
                    <span className="text-sm font-medium text-gray-500 ml-2">{p.quantity} vendus</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Vendeurs */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg cursor-pointer hover:shadow-xl transition-shadow group" onClick={() => setFullscreenChart('vendeurs')}>
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Performance vendeurs
            <svg className="w-4 h-4 text-gray-300 group-hover:text-[#313ADF] transition-colors ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </h3>
          {vendeurs.length > 0 ? (
            <div className="space-y-3">
              {vendeurs.map((v, i) => (
                <div key={i} className={`flex items-center gap-4 p-4 rounded-xl ${
                  i === 0 ? 'bg-yellow-50 border-2 border-yellow-300' :
                  i === 1 ? 'bg-gray-50 border-2 border-gray-300' :
                  i === 2 ? 'bg-orange-50 border-2 border-orange-300' :
                  'bg-white border border-gray-100'
                }`}>
                  <span className={`text-2xl font-bold ${
                    i === 0 ? 'text-yellow-500' :
                    i === 1 ? 'text-gray-400' :
                    i === 2 ? 'text-orange-400' :
                    'text-gray-300'
                  }`}>#{i + 1}</span>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white`}
                    style={{ backgroundColor: SELLER_COLORS[i % SELLER_COLORS.length] }}
                  >
                    {v.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#040741] truncate">{v.name}</p>
                    <p className="text-sm text-gray-500">{v.nbCommandes} commande{v.nbCommandes > 1 ? 's' : ''}</p>
                  </div>
                  <p className="font-bold text-[#313ADF] text-lg whitespace-nowrap">{formatCurrency(v.ca)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">Aucune donnee vendeur</p>
          )}
        </div>
      </div>

      {/* PRODUITS FAIBLE ROTATION + RESUME STOCK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Produits faible rotation */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Produits non vendus (30 jours)
          </h3>
          {produitsInactifs.length === 0 ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-500 text-sm">Tous les produits ont ete vendus recemment !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {produitsInactifs.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-orange-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-[#040741]">{p.name}</p>
                    {p.reference && <p className="text-xs text-gray-400">{p.reference}</p>}
                  </div>
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    Inactif
                  </span>
                </div>
              ))}
              <button
                onClick={() => navigate('/produits')}
                className="w-full mt-2 text-center text-sm text-[#313ADF] hover:underline font-medium"
              >
                Voir tous les produits →
              </button>
            </div>
          )}
        </div>

        {/* Résumé stock (management only) */}
        {canViewMargins ? (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
            <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              Resume stock
              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Gestion</span>
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-[#313ADF]/5 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-[#313ADF]">{formatCurrency(stockResume.valeurTotale)}</p>
                <p className="text-xs text-gray-500 mt-1">Valeur stock (au cout)</p>
              </div>
              <div className={`${stockResume.nbAlertes > 0 ? 'bg-red-50' : 'bg-green-50'} rounded-xl p-4 text-center`}>
                <p className={`text-2xl font-bold ${stockResume.nbAlertes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {stockResume.nbAlertes}
                </p>
                <p className="text-xs text-gray-500 mt-1">Alertes stock faible</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/stock')}
              className="w-full px-4 py-2.5 bg-[#313ADF]/10 text-[#313ADF] rounded-xl font-medium text-sm hover:bg-[#313ADF]/20 transition-colors"
            >
              Voir le stock complet →
            </button>
          </div>
        ) : (
          /* Livraisons en retard pour vendeurs */
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
            <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Livraisons en retard
            </h3>
            {livraisonsRetardList.length === 0 ? (
              <div className="py-6 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">Aucune livraison en retard !</p>
              </div>
            ) : (
              <div className="space-y-2">
                {livraisonsRetardList.slice(0, 5).map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2 px-3 bg-red-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-[#040741]">
                        {d.order?.order_number || 'Commande'}
                      </p>
                      <p className="text-xs text-gray-500">{d.delivery_address || 'Adresse non renseignee'}</p>
                    </div>
                    <span className="text-xs text-red-600 font-medium whitespace-nowrap ml-2">
                      {formatDate(d.scheduled_date)}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => navigate('/livraisons')}
                  className="w-full mt-2 text-center text-sm text-[#313ADF] hover:underline font-medium"
                >
                  Voir les livraisons →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* LIVRAISONS EN RETARD (management view - bottom section) */}
      {canViewMargins && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg mb-8">
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Livraisons en retard
            {livraisonsRetardList.length > 0 && (
              <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {livraisonsRetardList.length}
              </span>
            )}
          </h3>
          {livraisonsRetardList.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-gray-500 text-sm">Aucune livraison en retard. Bravo !</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Commande</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Client</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Date prevue</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Statut</th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {livraisonsRetardList.map((d) => {
                    const client = d.order?.customer
                      ? `${d.order.customer.first_name} ${d.order.customer.last_name}`
                      : 'Client inconnu'
                    const jours = Math.floor((new Date() - new Date(d.scheduled_date)) / (1000 * 60 * 60 * 24))
                    return (
                      <tr key={d.id} className="hover:bg-red-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-[#040741]">{d.order?.order_number || 'CMD-?'}</td>
                        <td className="px-4 py-3 text-gray-600">{client}</td>
                        <td className="px-4 py-3 text-red-600 font-medium">{formatDate(d.scheduled_date)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                            {jours}j de retard
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => navigate('/livraisons')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-medium text-sm hover:bg-red-200 transition-colors"
                          >
                            Traiter
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TABLEAU DES 10 DERNIERES COMMANDES TERMINEES */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden mb-8">
        <div className="bg-[#040741] px-6 py-4">
          <h3 className="text-lg font-bold text-white">10 dernieres commandes terminees</h3>
        </div>

        {dernieresCommandes.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            <p className="text-lg font-medium mb-1">Aucune commande terminee</p>
            <p className="text-sm">Les commandes terminees apparaitront ici</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">N° Commande</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Client</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-600">Montant TTC</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dernieresCommandes.map((commande, index) => (
                  <tr
                    key={commande.id}
                    className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium text-[#040741]">
                      {commande.order_number || `CMD-${commande.id?.slice(0, 6).toUpperCase()}`}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {commande.customer?.first_name && commande.customer?.last_name
                        ? `${commande.customer.first_name} ${commande.customer.last_name}`
                        : 'Client comptoir'
                      }
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(commande.created_at)}</td>
                    <td className="px-6 py-4 text-right font-bold text-[#313ADF]">{formatCurrency(commande.total_ttc || 0)}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => navigate(`/commandes/${commande.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#313ADF]/10 text-[#313ADF] rounded-lg font-medium text-sm hover:bg-[#313ADF]/20 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Voir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BOUTON RETOUR */}
      <button
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour a l'accueil
      </button>

      {/* Fullscreen chart modal */}
      {fullscreenChart === 'ca' && (
        <ChartModal title="Evolution du CA" onClose={() => setFullscreenChart(null)}>
          <div className="flex gap-2 flex-wrap mb-4">
            {[
              { value: 'jour', label: 'Jour' },
              { value: 'semaine', label: 'Semaine' },
              { value: 'mois', label: 'Mois' },
              { value: 'trimestre', label: 'Trimestre' },
              { value: 'annee', label: 'Annee' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setPeriodeCA(option.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  periodeCA === option.value
                    ? 'bg-[#313ADF] text-white shadow-md'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-[#313ADF] hover:text-[#313ADF]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div style={{ height: 'calc(100% - 50px)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={caParMoisFiltre} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mois" tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={{ stroke: '#E5E7EB' }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v}€`} axisLine={{ stroke: '#E5E7EB' }} />
                <Tooltip formatter={(value) => [formatCurrency(value), 'CA']} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }} labelStyle={{ fontWeight: 'bold', color: '#040741' }} />
                <Bar dataKey="ca" fill="#313ADF" radius={[8, 8, 0, 0]} maxBarSize={80} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartModal>
      )}

      {fullscreenChart === 'statut' && (
        <ChartModal title="Statuts commandes" onClose={() => setFullscreenChart(null)}>
          <div style={{ height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={repartitionStatut}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={160}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#6B7280', strokeWidth: 1 }}
                >
                  {repartitionStatut.map((entry, index) => (
                    <Cell key={`cell-fs-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartModal>
      )}

      {fullscreenChart === 'produits' && (
        <ChartModal title="Produits les plus vendus" onClose={() => setFullscreenChart(null)}>
          <div className="overflow-y-auto" style={{ height: '100%' }}>
            {topProduits.length > 0 ? (
              <div className="space-y-4">
                {topProduits.map((p, i) => {
                  const maxQty = topProduits[0]?.quantity || 1
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                        i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-base font-medium text-[#040741] truncate">{p.name}</span>
                          <span className="text-base font-bold text-[#313ADF] ml-2">{p.quantity} vendus</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-3">
                          <div className="bg-[#313ADF] h-3 rounded-full transition-all" style={{ width: `${(p.quantity / maxQty) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">Aucune donnee produit</p>
            )}
          </div>
        </ChartModal>
      )}

      {fullscreenChart === 'vendeurs' && (
        <ChartModal title="Performance vendeurs" onClose={() => setFullscreenChart(null)}>
          <div className="overflow-y-auto" style={{ height: '100%' }}>
            {vendeurs.length > 0 ? (
              <div className="space-y-4">
                {vendeurs.map((v, i) => (
                  <div key={i} className={`flex items-center gap-4 p-5 rounded-xl ${
                    i === 0 ? 'bg-yellow-50 border-2 border-yellow-300' :
                    i === 1 ? 'bg-gray-50 border-2 border-gray-300' :
                    i === 2 ? 'bg-orange-50 border-2 border-orange-300' :
                    'bg-white border border-gray-100'
                  }`}>
                    <span className={`text-3xl font-bold ${
                      i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-gray-300'
                    }`}>#{i + 1}</span>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                      style={{ backgroundColor: SELLER_COLORS[i % SELLER_COLORS.length] }}>
                      {v.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#040741] text-lg truncate">{v.name}</p>
                      <p className="text-gray-500">{v.nbCommandes} commande{v.nbCommandes > 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-bold text-[#313ADF] text-xl whitespace-nowrap">{formatCurrency(v.ca)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-center py-8">Aucune donnee vendeur</p>
            )}
          </div>
        </ChartModal>
      )}
    </div>
  )
}
