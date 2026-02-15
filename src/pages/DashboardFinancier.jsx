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

const COLORS = {
  brouillon: '#6B7280',
  envoyee: '#313ADF',
  payee: '#10B981',
  annulee: '#EF4444'
}

const SELLER_COLORS = ['#313ADF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

export default function DashboardFinancier() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [periodeCA, setPeriodeCA] = useState('mois')

  const [stats, setStats] = useState({
    caTotal: 0,
    totalFactures: 0,
    facturesPayees: 0,
    livraisonsEnCours: 0
  })

  const [facturesPayeesRaw, setFacturesPayeesRaw] = useState([])
  const [repartitionStatut, setRepartitionStatut] = useState([])
  const [dernieresFactures, setDernieresFactures] = useState([])
  const [topProduits, setTopProduits] = useState([])
  const [flopProduits, setFlopProduits] = useState([])
  const [vendeurs, setVendeurs] = useState([])

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

      // 1. Factures
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('*, customers(first_name, last_name)')
        .eq('workspace_id', workspace?.id)
        .order('created_at', { ascending: false })

      if (invoicesError) throw invoicesError

      // 2. Livraisons
      const { data: deliveriesData } = await supabase
        .from('deliveries')
        .select('*')
        .eq('workspace_id', workspace?.id)

      // 3. Invoice items will be fetched after filtering paid invoices

      // 4. Workspace users (for seller stats)
      const { data: membersData } = await supabase
        .from('workspace_users')
        .select('user_id, role, profiles(full_name, email)')
        .eq('workspace_id', workspace?.id)

      const invoices = invoicesData || []
      const deliveries = deliveriesData || []
      const members = membersData || []

      const normalize = (s) => s?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || ''

      const totalFactures = invoices.length
      const facturesPayees = invoices.filter(d => normalize(d.status) === 'payee')
      const caTotal = facturesPayees.reduce((sum, d) => sum + (parseFloat(d.total_ttc) || 0), 0)
      const livraisonsEnCours = deliveries.filter(l => l.status === 'en_cours').length

      setStats({ caTotal, totalFactures, facturesPayees: facturesPayees.length, livraisonsEnCours })
      setFacturesPayeesRaw(facturesPayees)

      // 3. Fetch invoice items for paid invoices only
      const paidIds = facturesPayees.map(f => f.id)
      let items = []
      if (paidIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('invoice_items')
          .select('product_id, description, quantity, total_ht')
          .eq('workspace_id', workspace?.id)
          .in('invoice_id', paidIds)
        items = itemsData || []
      }

      // Repartition par statut
      const statutCounts = { brouillon: 0, envoyee: 0, payee: 0, annulee: 0 }
      invoices.forEach(d => {
        const statut = normalize(d.status)
        if (statut === 'brouillon') statutCounts.brouillon++
        else if (statut === 'envoyee') statutCounts.envoyee++
        else if (statut === 'payee') statutCounts.payee++
        else if (statut === 'annulee') statutCounts.annulee++
        else statutCounts.brouillon++
      })
      setRepartitionStatut([
        { name: 'Brouillon', value: statutCounts.brouillon, color: COLORS.brouillon },
        { name: 'Envoyée', value: statutCounts.envoyee, color: COLORS.envoyee },
        { name: 'Payée', value: statutCounts.payee, color: COLORS.payee },
        { name: 'Annulée', value: statutCounts.annulee, color: COLORS.annulee }
      ].filter(item => item.value > 0))

      setDernieresFactures(facturesPayees.slice(0, 10))

      // Products ranking
      const prodMap = {}
      items.forEach(item => {
        const key = item.product_id || item.description || 'Autre'
        if (!prodMap[key]) {
          prodMap[key] = { name: item.description || 'Produit inconnu', quantity: 0, ca: 0 }
        }
        prodMap[key].quantity += parseInt(item.quantity) || 0
        prodMap[key].ca += parseFloat(item.total_ht) || 0
      })
      const prodList = Object.values(prodMap).sort((a, b) => b.quantity - a.quantity)
      setTopProduits(prodList.slice(0, 5))
      setFlopProduits(prodList.length > 1 ? [...prodList].sort((a, b) => a.quantity - b.quantity).slice(0, 5) : [])

      // Sellers ranking
      const memberMap = {}
      members.forEach(m => {
        memberMap[m.user_id] = m.profiles?.full_name || m.profiles?.email || 'Utilisateur'
      })

      const sellerMap = {}
      invoices.forEach(inv => {
        const uid = inv.created_by
        if (!uid) return
        if (!sellerMap[uid]) {
          sellerMap[uid] = { name: memberMap[uid] || 'Vendeur', nbFactures: 0, ca: 0 }
        }
        sellerMap[uid].nbFactures++
        sellerMap[uid].ca += parseFloat(inv.total_ttc) || 0
      })
      setVendeurs(Object.values(sellerMap).sort((a, b) => b.ca - a.ca))

    } catch (err) {
      console.error('Erreur chargement dashboard:', err)
      setError('Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // Build chart data based on selected period
  const getCAParPeriode = () => {
    const now = new Date()
    const joursSemaine = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

    if (periodeCA === 'jour') {
      // Today grouped by hour slots (matin/midi/après-midi/soir)
      const todayStr = now.toISOString().split('T')[0]
      const slots = [
        { label: '00h-06h', min: 0, max: 6, ca: 0 },
        { label: '06h-12h', min: 6, max: 12, ca: 0 },
        { label: '12h-18h', min: 12, max: 18, ca: 0 },
        { label: '18h-00h', min: 18, max: 24, ca: 0 }
      ]
      facturesPayeesRaw.forEach(f => {
        if (!f.created_at) return
        const d = new Date(f.created_at)
        if (d.toISOString().split('T')[0] === todayStr) {
          const h = d.getHours()
          const slot = slots.find(s => h >= s.min && h < s.max)
          if (slot) slot.ca += parseFloat(f.total_ttc) || 0
        }
      })
      return slots.map(s => ({ mois: s.label, ca: Math.round(s.ca * 100) / 100 }))
    }

    if (periodeCA === 'semaine') {
      // Last 7 days
      const data = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const dayStr = d.toISOString().split('T')[0]
        let ca = 0
        facturesPayeesRaw.forEach(f => {
          if (f.created_at && new Date(f.created_at).toISOString().split('T')[0] === dayStr) {
            ca += parseFloat(f.total_ttc) || 0
          }
        })
        data.push({ mois: `${joursSemaine[d.getDay()]} ${d.getDate()}`, ca: Math.round(ca * 100) / 100 })
      }
      return data
    }

    if (periodeCA === 'mois') {
      // Current month, grouped by week
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      const data = []
      for (let week = 0; week < 5; week++) {
        const weekStart = new Date(firstDay.getTime() + week * 7 * 86400000)
        if (weekStart.getMonth() !== now.getMonth() && week > 0) break
        const weekEnd = new Date(weekStart.getTime() + 7 * 86400000)
        let ca = 0
        facturesPayeesRaw.forEach(f => {
          if (!f.created_at) return
          const d = new Date(f.created_at)
          if (d >= weekStart && d < weekEnd && d.getMonth() === now.getMonth()) {
            ca += parseFloat(f.total_ttc) || 0
          }
        })
        data.push({ mois: `Sem ${week + 1}`, ca: Math.round(ca * 100) / 100 })
      }
      return data
    }

    if (periodeCA === 'trimestre') {
      // Last 3 months
      const data = []
      for (let i = 2; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        let ca = 0
        facturesPayeesRaw.forEach(f => {
          if (!f.created_at) return
          const fd = new Date(f.created_at)
          if (fd >= d && fd < nextMonth) {
            ca += parseFloat(f.total_ttc) || 0
          }
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
      facturesPayeesRaw.forEach(f => {
        if (!f.created_at) return
        const fd = new Date(f.created_at)
        if (fd >= d && fd < nextMonth) {
          ca += parseFloat(f.total_ttc) || 0
        }
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
        <p className="text-gray-500">Chargement des données...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-xl">
          <p className="font-medium">{error}</p>
          <button onClick={fetchDashboardData} className="mt-2 text-sm underline hover:no-underline">
            Réessayer
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
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">Dashboard Financier</h1>
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
            <span className="text-white/70 text-sm font-medium">CA Total</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats.caTotal)}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Total factures</span>
          </div>
          <p className="text-2xl font-bold text-[#040741]">{stats.totalFactures}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Payées</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.facturesPayees}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Livraisons</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">{stats.livraisonsEnCours}</p>
        </div>
      </div>

      {/* GRAPHIQUES (2 colonnes) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
        {/* Graphique CA */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-lg font-bold text-[#040741]">Évolution du CA</h3>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'jour', label: 'Jour' },
                { value: 'semaine', label: 'Semaine' },
                { value: 'mois', label: 'Mois' },
                { value: 'trimestre', label: 'Trimestre' },
                { value: 'annee', label: 'Année' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPeriodeCA(option.value)}
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
                <p>Aucune donnée de CA pour cette période</p>
              </div>
            </div>
          )}
        </div>

        {/* Répartition par statut */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <h3 className="text-lg font-bold text-[#040741] mb-4">Répartition par statut</h3>
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
                <p>Aucune facture disponible</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PRODUITS + VENDEURS (2 colonnes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Top / Flop Produits */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            Produits les plus vendus
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
            <p className="text-gray-400 text-center py-8">Aucune donnée produit</p>
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
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <h3 className="text-lg font-bold text-[#040741] mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Classement vendeurs
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
                    <p className="text-sm text-gray-500">{v.nbFactures} facture{v.nbFactures > 1 ? 's' : ''}</p>
                  </div>
                  <p className="font-bold text-[#313ADF] text-lg whitespace-nowrap">{formatCurrency(v.ca)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">Aucune donnée vendeur</p>
          )}
        </div>
      </div>

      {/* TABLEAU DES 10 DERNIÈRES FACTURES PAYÉES */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden mb-8">
        <div className="bg-[#040741] px-6 py-4">
          <h3 className="text-lg font-bold text-white">10 dernières factures payées</h3>
        </div>

        {dernieresFactures.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium mb-1">Aucune facture payée</p>
            <p className="text-sm">Les factures payées apparaîtront ici</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">N° Facture</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Client</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-600">Montant TTC</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dernieresFactures.map((facture, index) => (
                  <tr
                    key={facture.id}
                    className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium text-[#040741]">
                      {facture.invoice_number || `FAC-${facture.id?.slice(0, 6).toUpperCase()}`}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {facture.customers?.first_name && facture.customers?.last_name
                        ? `${facture.customers.first_name} ${facture.customers.last_name}`
                        : facture.customers?.last_name || facture.customers?.first_name || 'Client'
                      }
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(facture.created_at)}</td>
                    <td className="px-6 py-4 text-right font-bold text-[#313ADF]">{formatCurrency(facture.total_ttc || 0)}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => navigate(`/factures/${facture.id}`)}
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
        Retour à l'accueil
      </button>
    </div>
  )
}
