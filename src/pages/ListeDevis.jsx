import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'

export default function ListeDevis() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const [devis, setDevis] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatut, setFilterStatut] = useState('all')

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    loadDevis()
  }, [workspace?.id, wsLoading])

  const loadDevis = async () => {
    try {
      const { data } = await supabase
        .from('quotes')
        .select('*, customers(last_name, first_name, email)')
        .eq('workspace_id', workspace?.id)
        .order('created_at', { ascending: false })

      setDevis(data || [])
    } catch (err) {
      console.error('[ListeDevis] Erreur chargement:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredDevis = devis.filter(d => {
    const matchesSearch = searchTerm === '' ||
      d.quote_ref?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.customers?.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.customers?.first_name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatut = filterStatut === 'all' || d.status === filterStatut

    return matchesSearch && matchesStatut
  })

  const getStatutBadge = (statut) => {
    const badges = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
      sent: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Envoyé' },
      accepted: { bg: 'bg-green-100', text: 'text-green-600', label: 'Accepté' },
      rejected: { bg: 'bg-red-100', text: 'text-red-600', label: 'Refusé' },
      expired: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Expiré' }
    }
    const badge = badges[statut] || badges.draft
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
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
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">Mes devis</h1>
          <p className="text-gray-500">{devis.length} devis au total</p>
        </div>
        <button
          onClick={() => navigate('/devis/nouveau')}
          className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau devis
        </button>
      </div>

      {/* Filtres et Recherche */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[250px] relative">
          <svg className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Rechercher par nom, référence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
          />
        </div>

        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 cursor-pointer"
        >
          <option value="all">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="sent">Envoyé</option>
          <option value="accepted">Accepté</option>
          <option value="rejected">Refusé</option>
          <option value="expired">Expiré</option>
        </select>
      </div>

      {/* Liste des devis */}
      {filteredDevis.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-12 text-center">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-gray-500 mb-6 text-lg">
            {searchTerm || filterStatut !== 'all' ? 'Aucun devis trouvé avec ces critères' : 'Aucun devis pour le moment'}
          </p>
          <button
            onClick={() => navigate('/devis/nouveau')}
            className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Créer votre premier devis
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-500">
            <div className="col-span-2">Référence</div>
            <div className="col-span-3">Client</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-right">Montant TTC</div>
            <div className="col-span-2 text-center">Statut</div>
            <div className="col-span-1"></div>
          </div>

          <div className="divide-y divide-gray-100">
            {filteredDevis.map((d) => (
              <div
                key={d.id}
                onClick={() => navigate(`/devis/${d.id}`)}
                className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-[#313ADF]/5 cursor-pointer transition-colors items-center"
              >
                <div className="md:col-span-2">
                  <p className="font-bold text-[#040741]">{d.quote_ref || `DEV-${d.id?.slice(0, 6)}`}</p>
                </div>

                <div className="md:col-span-3">
                  <p className="font-medium text-[#040741]">
                    {d.customers ? `${d.customers.first_name} ${d.customers.last_name}` : 'Client'}
                  </p>
                  {d.customers?.email && (
                    <p className="text-sm text-gray-500">{d.customers.email}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <p className="text-gray-600">
                    {new Date(d.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </p>
                </div>

                <div className="md:col-span-2 text-right">
                  <p className="font-bold text-[#313ADF] text-lg">
                    {d.total_amount?.toFixed(2) || '0.00'} €
                  </p>
                </div>

                <div className="md:col-span-2 text-center">
                  {getStatutBadge(d.status)}
                </div>

                <div className="md:col-span-1 text-right">
                  <svg className="w-5 h-5 text-gray-400 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bouton Retour */}
      <button
        onClick={() => navigate('/dashboard')}
        className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour à l'accueil
      </button>
    </div>
  )
}
