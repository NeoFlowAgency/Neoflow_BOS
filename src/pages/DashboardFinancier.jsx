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
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts'

export default function DashboardFinancier() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    caTotal: 0,
    nbDevis: 0,
    nbAcceptes: 0,
    nbLivraisons: 0,
    tauxConversion: 0
  })
  const [caParMois, setCaParMois] = useState([])
  const [devisParStatut, setDevisParStatut] = useState([])
  const [topProduits, setTopProduits] = useState([])
  const [derniersDevis, setDerniersDevis] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      // Load all quotes (table: quotes)
      const { data: devisData } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false })

      // Load deliveries (table: deliveries)
      const { data: livraisonsData } = await supabase
        .from('deliveries')
        .select('*')
        .in('status', ['en_cours', 'planifiee'])

      // Load quote lines for product analysis (table: quote_lines)
      const { data: lignesData } = await supabase
        .from('quote_lines')
        .select('*, produits(nom)')

      if (devisData) {
        // Calculate global stats (field: status not statut)
        const devisAcceptes = devisData.filter(d => d.status === 'accepte')
        const caTotal = devisAcceptes.reduce((sum, d) => sum + (d.total_ttc || 0), 0)
        const nbDevis = devisData.length
        const nbAcceptes = devisAcceptes.length
        const tauxConversion = nbDevis > 0 ? (nbAcceptes / nbDevis) * 100 : 0

        setStats({
          caTotal,
          nbDevis,
          nbAcceptes,
          nbLivraisons: livraisonsData?.length || 0,
          tauxConversion
        })

        // CA by month (last 12 months)
        const caByMonth = {}
        const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

        // Initialize last 12 months
        const today = new Date()
        for (let i = 11; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          caByMonth[key] = { mois: moisNoms[d.getMonth()], ca: 0 }
        }

        devisAcceptes.forEach(d => {
          const date = new Date(d.created_at)
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          if (caByMonth[key]) {
            caByMonth[key].ca += d.total_ttc || 0
          }
        })

        setCaParMois(Object.values(caByMonth))

        // Quotes by status
        const statutCounts = {
          brouillon: 0,
          envoye: 0,
          accepte: 0,
          refuse: 0
        }
        devisData.forEach(d => {
          if (statutCounts[d.status] !== undefined) {
            statutCounts[d.status]++
          }
        })
        setDevisParStatut([
          { name: 'Brouillon', value: statutCounts.brouillon, color: '#9CA3AF' },
          { name: 'Envoyé', value: statutCounts.envoye, color: '#3B82F6' },
          { name: 'Accepté', value: statutCounts.accepte, color: '#10B981' },
          { name: 'Refusé', value: statutCounts.refuse, color: '#EF4444' }
        ])

        // Last 10 accepted quotes
        setDerniersDevis(devisAcceptes.slice(0, 10))
      }

      // Top products
      if (lignesData) {
        const productCounts = {}
        lignesData.forEach(l => {
          const prodName = l.produits?.nom || 'Produit inconnu'
          if (!productCounts[prodName]) {
            productCounts[prodName] = 0
          }
          productCounts[prodName] += l.quantite || 1
        })

        const sorted = Object.entries(productCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, quantite: count }))

        setTopProduits(sorted)
      }

    } catch (err) {
      console.error('Error loading financial data:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(value)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">Dashboard Financier</h1>
        <p className="text-gray-500">Vue d'ensemble de vos performances commerciales</p>
      </div>

      {/* Statistics Cards */}
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

        {/* Nb Devis */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Devis créés</span>
          </div>
          <p className="text-2xl font-bold text-[#040741]">{stats.nbDevis}</p>
        </div>

        {/* Devis Acceptés */}
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-gray-500 text-sm font-medium">Acceptés</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.nbAcceptes}</p>
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
          <p className="text-2xl font-bold text-orange-600">{stats.nbLivraisons}</p>
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* CA Evolution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <h3 className="text-lg font-bold text-[#040741] mb-4">Évolution du CA (12 derniers mois)</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={caParMois}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mois" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => [formatCurrency(value), 'CA']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                />
                <Line
                  type="monotone"
                  dataKey="ca"
                  stroke="#313ADF"
                  strokeWidth={3}
                  dot={{ fill: '#313ADF', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#040741' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Devis par statut */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg">
          <h3 className="text-lg font-bold text-[#040741] mb-4">Répartition des devis</h3>
          <div className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={devisParStatut}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#6B7280' }}
                >
                  {devisParStatut.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [value, name]}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Products */}
      {topProduits.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg mb-8">
          <h3 className="text-lg font-bold text-[#040741] mb-4">Top 5 des produits vendus</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProduits} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value) => [value, 'Quantité']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB' }}
                />
                <Bar dataKey="quantite" fill="#313ADF" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Last Accepted Quotes Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden mb-8">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-[#040741]">Derniers devis acceptés</h3>
        </div>
        {derniersDevis.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Aucun devis accepté pour le moment
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-500">N° Devis</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-500">Client</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-500">Montant TTC</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-500">Date</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {derniersDevis.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-[#040741]">
                      {d.quote_number || d.numero_devis || `DEV-${d.id?.slice(0, 6)}`}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {d.client_prenom || d.client_nom ? `${d.client_prenom || ''} ${d.client_nom || ''}`.trim() : 'Client'}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-[#313ADF]">
                      {formatCurrency(d.total_ttc || 0)}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(d.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => navigate(`/apercu-devis/${d.id}`)}
                        className="text-[#313ADF] hover:text-[#040741] font-medium text-sm"
                      >
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

      {/* Back Button */}
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
