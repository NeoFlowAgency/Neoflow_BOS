import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState({
    totalFactures: 0,
    livraisonsEnCours: 0,
    totalCA: 0,
    facturesEnAttente: 0
  })
  const [loading, setLoading] = useState(true)

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
      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      setUser(currentUser)

      // Get stats
      const [invoicesResult, deliveriesResult] = await Promise.all([
        supabase.from('invoices').select('id, total_ttc, statut').eq('workspace_id', workspace?.id),
        supabase.from('deliveries').select('id, statut').eq('workspace_id', workspace?.id)
      ])

      const invoicesList = invoicesResult.data || []
      const deliveriesList = deliveriesResult.data || []

      setStats({
        totalFactures: invoicesList.length,
        livraisonsEnCours: deliveriesList.filter(l => l.statut === 'en_cours').length,
        totalCA: invoicesList.reduce((sum, d) => sum + (d.total_ttc || 0), 0),
        facturesEnAttente: invoicesList.filter(d => d.statut === 'brouillon' || d.statut === 'envoyée').length
      })
    } catch (err) {
      console.error('[Dashboard] Erreur chargement données:', err.message, err)
    } finally {
      setLoading(false)
    }
  }

  const StatCard = ({ icon, label, value, color, onClick }) => (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all cursor-pointer group ${onClick ? 'hover:scale-[1.02]' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium mb-1">{label}</p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${color === 'text-[#313ADF]' ? 'bg-[#313ADF]/10' : color === 'text-green-600' ? 'bg-green-100' : color === 'text-orange-500' ? 'bg-orange-100' : 'bg-[#040741]/10'} flex items-center justify-center group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
      </div>
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
    <div className="p-8 min-h-screen">
      {/* Header de bienvenue */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-[#040741] mb-2">
          Bonjour, {userName} !
        </h1>
        <p className="text-gray-500 text-lg">
          Bienvenue sur votre tableau de bord {workspace?.name || ''}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          icon={
            <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          label="Total Factures"
          value={stats.totalFactures}
          color="text-[#313ADF]"
          onClick={() => navigate('/factures')}
        />
        <StatCard
          icon={
            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          label="En attente"
          value={stats.facturesEnAttente}
          color="text-orange-500"
          onClick={() => navigate('/factures')}
        />
        <StatCard
          icon={
            <svg className="w-6 h-6 text-[#040741]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          }
          label="Livraisons en cours"
          value={stats.livraisonsEnCours}
          color="text-[#040741]"
          onClick={() => navigate('/livraisons')}
        />
        <StatCard
          icon={
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          label="CA Total"
          value={`${stats.totalCA.toLocaleString('fr-FR')} €`}
          color="text-green-600"
          onClick={() => navigate('/dashboard-financier')}
        />
      </div>

      {/* Actions rapides */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[#040741] mb-6">Actions rapides</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ActionCard
            icon={
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
            title="Nouvelle facture"
            description="Créer une facture pour un client"
            onClick={() => navigate('/factures/nouvelle')}
            gradient="bg-gradient-to-br from-[#313ADF] to-[#040741]"
          />
          <ActionCard
            icon={
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
            title="Mes factures"
            description="Consulter toutes les factures"
            onClick={() => navigate('/factures')}
            gradient="bg-gradient-to-br from-[#040741] to-[#1a1a5e]"
          />
          <ActionCard
            icon={
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            title="Livraisons"
            description="Gérer les livraisons"
            onClick={() => navigate('/livraisons')}
            gradient="bg-gradient-to-br from-[#4f46e5] to-[#313ADF]"
          />
        </div>
      </div>

      {/* Info footer */}
      <div className="bg-gradient-to-r from-[#040741] to-[#313ADF] rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">{workspace?.name || 'Application'}</p>
            <p className="text-white/70 text-sm">Propulsé par Neoflow Agency</p>
          </div>
        </div>
      </div>
    </div>
  )
}
