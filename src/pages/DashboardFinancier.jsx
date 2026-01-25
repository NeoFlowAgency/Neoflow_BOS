import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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
  brouillon: '#6B7280',  // Gris
  envoye: '#313ADF',     // Bleu électrique
  accepte: '#10B981',    // Vert
  refuse: '#EF4444'      // Rouge
}

export default function DashboardFinancier() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // État pour la période du graphique CA (par défaut 6 mois)
  const [periodeCA, setPeriodeCA] = useState(6)

  // États pour les KPIs
  const [stats, setStats] = useState({
    caTotal: 0,
    totalDevis: 0,
    devisAcceptes: 0,
    livraisonsEnCours: 0,
    tauxConversion: 0
  })

  // États pour les graphiques
  const [caParMoisComplet, setCaParMoisComplet] = useState([]) // Toutes les données
  const [repartitionStatut, setRepartitionStatut] = useState([])

  // État pour le tableau
  const [derniersDevis, setDerniersDevis] = useState([])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      // ========================================
      // 1. RÉCUPÉRER TOUS LES DEVIS
      // ========================================
      const { data: devisData, error: devisError } = await supabase
        .from('devis')
        .select('*')
        .order('created_at', { ascending: false })

      if (devisError) {
        console.error('Erreur récupération devis:', devisError)
        throw devisError
      }

      // ========================================
      // 2. RÉCUPÉRER TOUTES LES LIVRAISONS
      // ========================================
      const { data: livraisonsData, error: livraisonsError } = await supabase
        .from('livraisons')
        .select('*')

      if (livraisonsError) {
        console.error('Erreur récupération livraisons:', livraisonsError)
      }

      // ========================================
      // DEBUG LOGS
      // ========================================
      console.log('=== DASHBOARD FINANCIER DEBUG ===')
      console.log('Devis récupérés:', devisData?.length || 0)
      console.log('Livraisons récupérées:', livraisonsData?.length || 0)
      if (devisData && devisData.length > 0) {
        console.log('Premier devis (structure):', devisData[0])
        console.log('Statuts disponibles:', [...new Set(devisData.map(d => d.statut))])
      }
      console.log('================================')

      // ========================================
      // 3. CALCULER LES STATISTIQUES
      // (MÊME LOGIQUE QUE LA PAGE ACCUEIL)
      // ========================================
      const devis = devisData || []
      const livraisons = livraisonsData || []

      // ✅ CA Total = somme de TOUS les devis (comme Accueil)
      const caTotal = devis.reduce((sum, d) => sum + (parseFloat(d.total_ttc) || 0), 0)

      // Total devis
      const totalDevis = devis.length

      // Devis acceptés
      const devisAcceptes = devis.filter(d =>
        d.statut === 'accepte' || d.statut === 'accepté'
      )

      // ✅ Livraisons en cours (même filtre que Accueil)
      const livraisonsEnCours = livraisons.filter(l => l.statut === 'en_cours').length

      // Devis envoyés (pour le taux de conversion)
      const devisEnvoyes = devis.filter(d =>
        d.statut === 'envoye' || d.statut === 'envoyé' ||
        d.statut === 'accepte' || d.statut === 'accepté' ||
        d.statut === 'refuse' || d.statut === 'refusé'
      )

      // Taux de conversion = (acceptés / envoyés) * 100
      const tauxConversion = devisEnvoyes.length > 0
        ? (devisAcceptes.length / devisEnvoyes.length) * 100
        : 0

      setStats({
        caTotal,
        totalDevis,
        devisAcceptes: devisAcceptes.length,
        livraisonsEnCours,
        tauxConversion
      })

      // ========================================
      // 4. PRÉPARER DONNÉES CA PAR MOIS (TOUTES LES DONNÉES)
      // ========================================
      const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
      const today = new Date()

      // Trouver la date du premier devis pour "Toujours"
      let premierDevisDate = today
      if (devis.length > 0) {
        const dates = devis
          .filter(d => d.created_at)
          .map(d => new Date(d.created_at))
        if (dates.length > 0) {
          premierDevisDate = new Date(Math.min(...dates))
        }
      }

      // Calculer le nombre de mois depuis le premier devis
      const moisDepuisPremier = (today.getFullYear() - premierDevisDate.getFullYear()) * 12 +
        (today.getMonth() - premierDevisDate.getMonth()) + 1

      // Initialiser tous les mois possibles (jusqu'à 36 mois max pour "Toujours")
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

      // Ajouter le CA des devis acceptés (pour le graphique CA)
      devisAcceptes.forEach(d => {
        if (d.created_at) {
          const date = new Date(d.created_at)
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          if (caByMonth[key]) {
            caByMonth[key].ca += parseFloat(d.total_ttc) || 0
          }
        }
      })

      // Stocker toutes les données du CA par mois
      setCaParMoisComplet(Object.values(caByMonth).reverse())

      // ========================================
      // 5. PRÉPARER DONNÉES RÉPARTITION PAR STATUT
      // ========================================
      const statutCounts = {
        brouillon: 0,
        envoye: 0,
        accepte: 0,
        refuse: 0
      }

      devis.forEach(d => {
        const statut = d.statut?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || 'brouillon'
        if (statut === 'brouillon') statutCounts.brouillon++
        else if (statut === 'envoye' || statut === 'envoyé') statutCounts.envoye++
        else if (statut === 'accepte' || statut === 'accepté') statutCounts.accepte++
        else if (statut === 'refuse' || statut === 'refusé') statutCounts.refuse++
        else statutCounts.brouillon++
      })

      setRepartitionStatut([
        { name: 'Brouillon', value: statutCounts.brouillon, color: COLORS.brouillon },
        { name: 'Envoyé', value: statutCounts.envoye, color: COLORS.envoye },
        { name: 'Accepté', value: statutCounts.accepte, color: COLORS.accepte },
        { name: 'Refusé', value: statutCounts.refuse, color: COLORS.refuse }
      ].filter(item => item.value > 0))

      // ========================================
      // 6. RÉCUPÉRER LES 10 DERNIERS DEVIS ACCEPTÉS
      // ========================================
      setDerniersDevis(devisAcceptes.slice(0, 10))

    } catch (err) {
      console.error('Erreur chargement dashboard:', err)
      setError('Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  // ========================================
  // FILTRER CA PAR PÉRIODE SÉLECTIONNÉE
  // ========================================
  const getCAParPeriode = () => {
    if (periodeCA === 'toujours') {
      return caParMoisComplet
    }
    // Prendre les N derniers mois
    return caParMoisComplet.slice(-periodeCA)
  }

  // Formater les montants en euros
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(value)
  }

  // Formater la date
  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  // ========================================
  // AFFICHAGE LOADING
  // ========================================
  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent mb-4"></div>
        <p className="text-gray-500">Chargement des données...</p>
      </div>
    )
  }

  // ========================================
  // AFFICHAGE ERREUR
  // ========================================
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

  // Données CA filtrées selon la période
  const caParMoisFiltre = getCAParPeriode()

  // ========================================
  // RENDU PRINCIPAL
  // ========================================
  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* ========================================
          HEADER
      ======================================== */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">
          Dashboard Financier
        </h1>
        <p className="text-gray-500">Vue d'ensemble de vos performances commerciales</p>
      </div>

      {/* ========================================
          5 CARTES KPI
      ======================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">

        {/* 💰 CA Total */}
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

        {/* 📄 Total Devis */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Total devis</span>
          </div>
          <p className="text-2xl font-bold text-[#040741]">{stats.totalDevis}</p>
        </div>

        {/* ✅ Devis Acceptés */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Acceptés</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.devisAcceptes}</p>
        </div>

        {/* 🚚 Livraisons en cours */}
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

        {/* 📊 Taux de conversion */}
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

      {/* ========================================
          GRAPHIQUES (2 colonnes)
      ======================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">

        {/* Graphique CA par mois (60% = 3/5) */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          {/* Titre + Sélecteur de période */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h3 className="text-lg font-bold text-[#040741]">
              Évolution du CA
            </h3>

            {/* ========================================
                SÉLECTEUR DE PÉRIODE
            ======================================== */}
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

          {/* Graphique */}
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

        {/* Graphique Répartition par statut (40% = 2/5) */}
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
                <p>Aucun devis disponible</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================
          TABLEAU DES 10 DERNIERS DEVIS ACCEPTÉS
      ======================================== */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden mb-8">
        <div className="bg-[#040741] px-6 py-4">
          <h3 className="text-lg font-bold text-white">
            10 derniers devis acceptés
          </h3>
        </div>

        {derniersDevis.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg font-medium mb-1">Aucun devis accepté</p>
            <p className="text-sm">Les devis acceptés apparaîtront ici</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">N° Devis</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Client</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-600">Date</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-600">Montant TTC</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {derniersDevis.map((devis, index) => (
                  <tr
                    key={devis.id}
                    className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 1 ? 'bg-gray-50/50' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium text-[#040741]">
                      {devis.numero_devis || `DEV-${devis.id?.slice(0, 6).toUpperCase()}`}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {devis.client_prenom && devis.client_nom
                        ? `${devis.client_prenom} ${devis.client_nom}`
                        : devis.client_nom || devis.client_prenom || 'Client'
                      }
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatDate(devis.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-[#313ADF]">
                      {formatCurrency(devis.total_ttc || 0)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => navigate(`/apercu-devis/${devis.id}`)}
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

      {/* ========================================
          BOUTON RETOUR
      ======================================== */}
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
