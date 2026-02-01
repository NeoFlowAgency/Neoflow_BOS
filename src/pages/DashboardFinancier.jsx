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

// Couleurs pour le PieChart
const COLORS = {
  brouillon: '#6B7280',
  envoyee: '#313ADF',
  payee: '#10B981',
  annulee: '#EF4444'
}

export default function DashboardFinancier() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // État pour la période du graphique CA (par défaut 6 mois)
  const [periodeCA, setPeriodeCA] = useState(6)

  // États pour les KPIs
  const [stats, setStats] = useState({
    caTotal: 0,
    totalFactures: 0,
    facturesPayees: 0,
    livraisonsEnCours: 0,
    tauxConversion: 0
  })

  // États pour les graphiques
  const [caParMoisComplet, setCaParMoisComplet] = useState([])
  const [repartitionStatut, setRepartitionStatut] = useState([])

  // État pour le tableau
  const [dernieresFactures, setDernieresFactures] = useState([])

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

      // 1. RÉCUPÉRER TOUTES LES FACTURES
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select('*')
        .eq('workspace_id', workspace?.id)
        .order('created_at', { ascending: false })

      if (invoicesError) {
        console.error('Erreur récupération factures:', invoicesError)
        throw invoicesError
      }

      // 2. RÉCUPÉRER TOUTES LES LIVRAISONS
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('deliveries')
        .select('*')
        .eq('workspace_id', workspace?.id)

      if (deliveriesError) {
        console.error('Erreur récupération livraisons:', deliveriesError)
      }

      // 3. CALCULER LES STATISTIQUES
      const invoices = invoicesData || []
      const deliveries = deliveriesData || []

      // CA Total = somme de TOUTES les factures
      const caTotal = invoices.reduce((sum, d) => sum + (parseFloat(d.total_ttc) || 0), 0)

      // Total factures
      const totalFactures = invoices.length

      // Factures payées
      const normalize = (s) => s?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || ''

      const facturesPayees = invoices.filter(d => normalize(d.statut) === 'payee')

      // Livraisons en cours
      const livraisonsEnCours = deliveries.filter(l => l.statut === 'en_cours').length

      // Factures envoyées (pour le taux de conversion)
      const facturesTraitees = invoices.filter(d => {
        const s = normalize(d.statut)
        return s === 'envoyee' || s === 'payee' || s === 'annulee'
      })

      // Taux de conversion = (payées / traitées) * 100
      const tauxConversion = facturesTraitees.length > 0
        ? (facturesPayees.length / facturesTraitees.length) * 100
        : 0

      setStats({
        caTotal,
        totalFactures,
        facturesPayees: facturesPayees.length,
        livraisonsEnCours,
        tauxConversion
      })

      // 4. PRÉPARER DONNÉES CA PAR MOIS
      const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
      const today = new Date()

      let premiereFactureDate = today
      if (invoices.length > 0) {
        const dates = invoices
          .filter(d => d.created_at)
          .map(d => new Date(d.created_at))
        if (dates.length > 0) {
          premiereFactureDate = new Date(Math.min(...dates))
        }
      }

      const moisDepuisPremier = (today.getFullYear() - premiereFactureDate.getFullYear()) * 12 +
        (today.getMonth() - premiereFactureDate.getMonth()) + 1

      const maxMois = Math.min(Math.max(moisDepuisPremier, 12), 36)
      const caByMonth = {}

      for (let i = maxMois - 1; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const annee = String(d.getFullYear()).slice(-2)
        caByMonth[key] = {
          mois: `${moisNoms[d.getMonth()]} ${annee}`,
          moisCourt: moisNoms[d.getMonth()],
          ca: 0,
          fullKey: key,
          ordre: i
        }
      }

      // Ajouter le CA des factures payées
      facturesPayees.forEach(d => {
        if (d.created_at) {
          const date = new Date(d.created_at)
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          if (caByMonth[key]) {
            caByMonth[key].ca += parseFloat(d.total_ttc) || 0
          }
        }
      })

      setCaParMoisComplet(Object.values(caByMonth).reverse())

      // 5. PRÉPARER DONNÉES RÉPARTITION PAR STATUT
      const statutCounts = {
        brouillon: 0,
        envoyee: 0,
        payee: 0,
        annulee: 0
      }

      invoices.forEach(d => {
        const statut = normalize(d.statut)
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

      // 6. RÉCUPÉRER LES 10 DERNIÈRES FACTURES PAYÉES
      setDernieresFactures(facturesPayees.slice(0, 10))

    } catch (err) {
      console.error('Erreur chargement dashboard:', err)
      setError('Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // FILTRER CA PAR PÉRIODE SÉLECTIONNÉE
  const getCAParPeriode = () => {
    if (periodeCA === 'toujours') {
      return caParMoisComplet
    }
    return caParMoisComplet.slice(-periodeCA)
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(value)
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
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
          <button
            onClick={fetchDashboardData}
            className="mt-2 text-sm underline hover:no-underline"
          >
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
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">
          Dashboard Financier
        </h1>
        <p className="text-gray-500">Vue d'ensemble de vos performances commerciales</p>
      </div>

      {/* 5 CARTES KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">

        {/* CA Total */}
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

        {/* Total Factures */}
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

        {/* Factures Payées */}
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

        {/* Livraisons en cours */}
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

        {/* Taux de conversion */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Conversion</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">{stats.tauxConversion.toFixed(1)}%</p>
        </div>
      </div>

      {/* GRAPHIQUES (2 colonnes) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">

        {/* Graphique CA par mois (60%) */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-lg font-bold text-[#040741]">
              Évolution du CA
            </h3>

            <div className="flex gap-2 flex-wrap">
              {[
                { value: 3, label: '3 mois' },
                { value: 6, label: '6 mois' },
                { value: 12, label: '12 mois' },
                { value: 'toujours', label: 'Toujours' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setPeriodeCA(option.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
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
                    dataKey={periodeCA === 'toujours' || periodeCA > 6 ? 'mois' : 'moisCourt'}
                    tick={{ fill: '#6B7280', fontSize: 11 }}
                    axisLine={{ stroke: '#E5E7EB' }}
                    interval={periodeCA === 'toujours' ? 2 : 0}
                    angle={periodeCA === 'toujours' ? -45 : 0}
                    textAnchor={periodeCA === 'toujours' ? 'end' : 'middle'}
                    height={periodeCA === 'toujours' ? 60 : 30}
                  />
                  <YAxis
                    tick={{ fill: '#6B7280', fontSize: 12 }}
                    tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v}€`}
                    axisLine={{ stroke: '#E5E7EB' }}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(value), 'CA']}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    labelStyle={{ fontWeight: 'bold', color: '#040741' }}
                  />
                  <Bar
                    dataKey="ca"
                    fill="#313ADF"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={60}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p>Aucune donnée de CA disponible</p>
              </div>
            </div>
          )}
        </div>

        {/* Graphique Répartition par statut (40%) */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <h3 className="text-lg font-bold text-[#040741] mb-4">
            Répartition par statut
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
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
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

      {/* TABLEAU DES 10 DERNIÈRES FACTURES PAYÉES */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden mb-8">
        <div className="bg-[#040741] px-6 py-4">
          <h3 className="text-lg font-bold text-white">
            10 dernières factures payées
          </h3>
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
                      {facture.client_prenom && facture.client_nom
                        ? `${facture.client_prenom} ${facture.client_nom}`
                        : facture.client_nom || facture.client_prenom || 'Client'
                      }
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(facture.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-[#313ADF]">
                      {formatCurrency(facture.total_ttc || 0)}
                    </td>
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
