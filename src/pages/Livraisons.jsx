import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { creerLivraison } from '../lib/api'

export default function Livraisons() {
  const navigate = useNavigate()
  const [livraisons, setLivraisons] = useState([])
  const [loading, setLoading] = useState(true)

  // BUG #7 FIX: Modal state for new delivery workflow
  const [showModal, setShowModal] = useState(false)
  const [modalStep, setModalStep] = useState('choice') // 'choice', 'existing', 'new'
  const [devisDisponibles, setDevisDisponibles] = useState([])
  const [selectedDevis, setSelectedDevis] = useState(null)
  const [livraisonForm, setLivraisonForm] = useState({
    date_prevue: '',
    adresse_livraison: '',
    notes: ''
  })
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    loadLivraisons()
  }, [])

  const loadLivraisons = async () => {
    try {
      const { data } = await supabase
        .from('livraisons')
        .select('*, devis(numero_devis, total_ttc, clients(nom, prenom, adresse))')
        .order('date_prevue', { ascending: true })

      setLivraisons(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // BUG #7 FIX: Load available devis for linking
  const loadDevisDisponibles = async () => {
    try {
      const { data } = await supabase
        .from('devis')
        .select('*, clients(nom, prenom, adresse)')
        .in('statut', ['accepte', 'envoye', 'brouillon'])
        .order('created_at', { ascending: false })

      setDevisDisponibles(data || [])
    } catch (err) {
      console.error('Erreur chargement devis:', err)
    }
  }

  const aujourdhui = new Date().toISOString().split('T')[0]

  const grouped = {
    en_cours: livraisons.filter(l => l.statut === 'en_cours' && l.date_prevue >= aujourdhui),
    en_retard: livraisons.filter(l => l.statut === 'en_cours' && l.date_prevue < aujourdhui),
    finalise: livraisons.filter(l => l.statut === 'finalise')
  }

  const handleStatutChange = async (livraisonId, newStatut) => {
    try {
      const updateData = { statut: newStatut }
      if (newStatut === 'finalise') {
        updateData.date_livree = new Date().toISOString()
      }

      await supabase
        .from('livraisons')
        .update(updateData)
        .eq('id', livraisonId)

      await loadLivraisons()
    } catch (err) {
      console.error(err)
    }
  }

  // BUG #7 FIX: Open modal and load available devis
  const openNewLivraisonModal = async () => {
    setShowModal(true)
    setModalStep('choice')
    setSelectedDevis(null)
    setLivraisonForm({ date_prevue: '', adresse_livraison: '', notes: '' })
    setCreateError('')
    await loadDevisDisponibles()
  }

  // BUG #7 FIX: Handle devis selection
  const handleSelectDevis = (devis) => {
    setSelectedDevis(devis)
    setLivraisonForm({
      ...livraisonForm,
      adresse_livraison: devis.clients?.adresse || ''
    })
  }

  // BUG #7 FIX: Create livraison linked to existing devis
  const handleCreateLivraison = async () => {
    if (!selectedDevis) {
      setCreateError('Veuillez sélectionner une commande')
      return
    }
    if (!livraisonForm.date_prevue) {
      setCreateError('Veuillez sélectionner une date de livraison')
      return
    }

    setCreateLoading(true)
    setCreateError('')

    try {
      await creerLivraison({
        devis_id: selectedDevis.id,
        date_prevue: livraisonForm.date_prevue,
        adresse_livraison: livraisonForm.adresse_livraison,
        notes: livraisonForm.notes
      })

      setShowModal(false)
      await loadLivraisons()
    } catch (err) {
      setCreateError(err.message || 'Erreur lors de la création')
    } finally {
      setCreateLoading(false)
    }
  }

  const LivraisonCard = ({ livraison, onClick, showComplete = false }) => {
    const client = livraison.devis?.clients
    const clientName = client ? `${client.prenom} ${client.nom}` : 'Client inconnu'
    const adresse = livraison.adresse_livraison || client?.adresse || ''
    const datePrevue = livraison.date_prevue ? new Date(livraison.date_prevue).toLocaleDateString('fr-FR') : ''

    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all group">
        <div className="flex items-start justify-between mb-2">
          <p className="font-bold text-[#040741] text-lg">{clientName}</p>
          {livraison.devis?.total_ttc && (
            <span className="text-sm font-semibold text-[#313ADF]">
              {livraison.devis.total_ttc.toFixed(0)} €
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 leading-snug mb-2">{adresse}</p>
        {datePrevue && (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {datePrevue}
          </p>
        )}
        {showComplete && (
          <button
            onClick={() => onClick(livraison.id)}
            className="mt-3 w-full py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Marquer comme livré
          </button>
        )}
      </div>
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
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#040741] mb-1">Livraisons</h1>
          <p className="text-gray-500">Gérez vos livraisons en cours</p>
        </div>
        <button
          onClick={openNewLivraisonModal}
          className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle livraison
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* En cours */}
        <div>
          <div className="bg-[#313ADF]/10 rounded-xl py-3 px-6 text-center mb-4">
            <h2 className="font-bold text-[#313ADF] text-lg flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              En cours ({grouped.en_cours.length})
            </h2>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 min-h-[500px]">
            <div className="space-y-3">
              {grouped.en_cours.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucune livraison en cours</p>
              ) : (
                grouped.en_cours.map(l => (
                  <LivraisonCard
                    key={l.id}
                    livraison={l}
                    onClick={(id) => handleStatutChange(id, 'finalise')}
                    showComplete={true}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* En retard */}
        <div>
          <div className="bg-orange-100 rounded-xl py-3 px-6 text-center mb-4">
            <h2 className="font-bold text-orange-600 text-lg flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              En retard ({grouped.en_retard.length})
            </h2>
          </div>
          <div className="bg-orange-50 rounded-2xl p-4 min-h-[500px]">
            <div className="space-y-3">
              {grouped.en_retard.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucune livraison en retard</p>
              ) : (
                grouped.en_retard.map(l => (
                  <LivraisonCard
                    key={l.id}
                    livraison={l}
                    onClick={(id) => handleStatutChange(id, 'finalise')}
                    showComplete={true}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Finalisées */}
        <div>
          <div className="bg-green-100 rounded-xl py-3 px-6 text-center mb-4">
            <h2 className="font-bold text-green-600 text-lg flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Finalisées ({grouped.finalise.length})
            </h2>
          </div>
          <div className="bg-green-50 rounded-2xl p-4 min-h-[500px]">
            <div className="space-y-3">
              {grouped.finalise.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucune livraison finalisée</p>
              ) : (
                grouped.finalise.map(l => (
                  <LivraisonCard
                    key={l.id}
                    livraison={l}
                    onClick={() => {}}
                    showComplete={false}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BUG #7 FIX: Modal Nouvelle Livraison */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#040741]">Nouvelle livraison</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step: Choice */}
            {modalStep === 'choice' && (
              <div className="space-y-4">
                <p className="text-gray-600 mb-4">Comment souhaitez-vous créer cette livraison ?</p>

                <button
                  onClick={() => setModalStep('existing')}
                  className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-[#313ADF] hover:bg-[#313ADF]/5 transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#313ADF]/10 rounded-xl flex items-center justify-center group-hover:bg-[#313ADF]/20 transition-colors">
                      <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-[#040741]">Lier à une commande existante</p>
                      <p className="text-sm text-gray-500">Sélectionner un devis déjà créé</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/creer-devis')}
                  className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-[#313ADF] hover:bg-[#313ADF]/5 transition-all text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#313ADF]/10 rounded-xl flex items-center justify-center group-hover:bg-[#313ADF]/20 transition-colors">
                      <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-[#040741]">Créer une nouvelle commande</p>
                      <p className="text-sm text-gray-500">D'abord créer le devis, puis la livraison</p>
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Step: Select Existing Devis */}
            {modalStep === 'existing' && (
              <div>
                <button
                  onClick={() => setModalStep('choice')}
                  className="mb-4 text-sm text-gray-500 hover:text-[#313ADF] flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Retour
                </button>

                {/* Liste des devis disponibles */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-[#040741] mb-3">
                    Sélectionner une commande
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
                    {devisDisponibles.length === 0 ? (
                      <p className="p-4 text-center text-gray-500">Aucune commande disponible</p>
                    ) : (
                      devisDisponibles.map((devis) => (
                        <button
                          key={devis.id}
                          onClick={() => handleSelectDevis(devis)}
                          className={`w-full p-3 text-left border-b last:border-b-0 transition-colors ${
                            selectedDevis?.id === devis.id
                              ? 'bg-[#313ADF]/10 border-[#313ADF]'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-[#040741]">
                                {devis.clients?.prenom} {devis.clients?.nom}
                              </p>
                              <p className="text-sm text-gray-500">
                                {devis.numero_devis} - {new Date(devis.created_at).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                            <span className="font-semibold text-[#313ADF]">
                              {devis.total_ttc?.toFixed(0)} €
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Formulaire livraison */}
                {selectedDevis && (
                  <div className="space-y-4 border-t border-gray-100 pt-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#040741] mb-2">
                        Date de livraison prévue *
                      </label>
                      <input
                        type="date"
                        value={livraisonForm.date_prevue}
                        onChange={(e) => setLivraisonForm({ ...livraisonForm, date_prevue: e.target.value })}
                        min={aujourdhui}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#040741] mb-2">
                        Adresse de livraison
                      </label>
                      <input
                        type="text"
                        value={livraisonForm.adresse_livraison}
                        onChange={(e) => setLivraisonForm({ ...livraisonForm, adresse_livraison: e.target.value })}
                        placeholder="Adresse de livraison"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#040741] mb-2">
                        Notes (optionnel)
                      </label>
                      <textarea
                        value={livraisonForm.notes}
                        onChange={(e) => setLivraisonForm({ ...livraisonForm, notes: e.target.value })}
                        placeholder="Instructions de livraison..."
                        rows={2}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
                      />
                    </div>

                    {createError && (
                      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm">
                        {createError}
                      </div>
                    )}

                    <button
                      onClick={handleCreateLivraison}
                      disabled={createLoading}
                      className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {createLoading ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Création...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Créer la livraison
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
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
