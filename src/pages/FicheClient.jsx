import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function FicheClient() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const toast = useToast()
  const [client, setClient] = useState(null)
  const [factures, setFactures] = useState([])
  const [devis, setDevis] = useState([])
  const [interactions, setInteractions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saveLoading, setSaveLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('factures')

  // Interaction modal
  const [showInteractionModal, setShowInteractionModal] = useState(false)
  const [interactionForm, setInteractionForm] = useState({
    interaction_type: 'note', notes: ''
  })
  const [interactionLoading, setInteractionLoading] = useState(false)

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    loadAll()
  }, [clientId, workspace?.id, wsLoading])

  const loadAll = async () => {
    try {
      const [clientRes, facturesRes, devisRes, interactionsRes] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('id', clientId)
          .eq('workspace_id', workspace.id)
          .single(),
        supabase
          .from('invoices')
          .select('*')
          .eq('customer_id', clientId)
          .eq('workspace_id', workspace.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('quotes')
          .select('*')
          .eq('customer_id', clientId)
          .eq('workspace_id', workspace.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('client_interactions')
          .select('*')
          .eq('customer_id', clientId)
          .eq('workspace_id', workspace.id)
          .order('created_at', { ascending: false })
      ])

      if (clientRes.error) {
        setClient(null)
      } else {
        setClient(clientRes.data)
        setEditForm(clientRes.data)
      }
      setFactures(facturesRes.data || [])
      setDevis(devisRes.data || [])
      setInteractions(interactionsRes.data || [])
    } catch (err) {
      console.error('[FicheClient] Erreur:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaveLoading(true)
    try {
      const { error } = await supabase
        .from('customers')
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          email: editForm.email,
          phone: editForm.phone,
          address: editForm.address,
          company_name: editForm.company_name
        })
        .eq('id', clientId)
        .eq('workspace_id', workspace.id)

      if (error) throw error

      toast.success('Client mis à jour !')
      setEditing(false)
      loadAll()
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleAddInteraction = async () => {
    if (!interactionForm.notes.trim()) {
      toast.error('Veuillez ajouter une note')
      return
    }

    setInteractionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('client_interactions')
        .insert({
          workspace_id: workspace.id,
          customer_id: clientId,
          interaction_type: interactionForm.interaction_type,
          notes: interactionForm.notes,
          created_by: user?.id
        })

      if (error) throw error

      toast.success('Interaction ajoutée !')
      setShowInteractionModal(false)
      setInteractionForm({ interaction_type: 'note', notes: '' })
      loadAll()
    } catch (err) {
      toast.error(err.message || "Erreur lors de l'ajout")
    } finally {
      setInteractionLoading(false)
    }
  }

  const getInteractionIcon = (type) => {
    switch (type) {
      case 'appel':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        )
      case 'email':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )
      case 'reunion':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        )
    }
  }

  const interactionTypeLabel = {
    appel: 'Appel',
    email: 'Email',
    reunion: 'Réunion',
    note: 'Note'
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-500 mb-4">Client non trouvé</p>
        <button onClick={() => navigate('/clients')} className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold">
          Retour aux clients
        </button>
      </div>
    )
  }

  const totalFactures = factures.reduce((sum, f) => sum + (f.total_ttc || 0), 0)
  const facturesPayees = factures.filter(f => {
    const s = f.status?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || ''
    return s === 'payee'
  })

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center">
            <span className="text-2xl font-bold text-[#313ADF]">
              {client.first_name?.charAt(0)}{client.last_name?.charAt(0)}
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-[#040741]">
              {client.first_name} {client.last_name}
            </h1>
            {client.company_name && (
              <p className="text-[#313ADF] font-medium">{client.company_name}</p>
            )}
            <p className="text-gray-500">{client.email || 'Pas d\'email'}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowInteractionModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#040741] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle interaction
          </button>

          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#313ADF] text-[#313ADF] rounded-xl font-medium hover:bg-[#313ADF]/5 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Modifier
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {saveLoading ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditForm(client) }}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <p className="text-gray-500 text-sm">Total facturé</p>
          <p className="text-2xl font-bold text-[#313ADF]">{totalFactures.toLocaleString('fr-FR')} €</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <p className="text-gray-500 text-sm">Factures</p>
          <p className="text-2xl font-bold text-[#040741]">{factures.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <p className="text-gray-500 text-sm">Devis</p>
          <p className="text-2xl font-bold text-[#040741]">{devis.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-lg">
          <p className="text-gray-500 text-sm">Interactions</p>
          <p className="text-2xl font-bold text-[#040741]">{interactions.length}</p>
        </div>
      </div>

      {/* Infos client (mode édition) */}
      {editing && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-[#040741] mb-4">Informations client</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#040741] mb-2">Prénom</label>
              <input type="text" value={editForm.first_name || ''} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#040741] mb-2">Nom</label>
              <input type="text" value={editForm.last_name || ''} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#040741] mb-2">Email</label>
              <input type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#040741] mb-2">Téléphone</label>
              <input type="tel" value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#040741] mb-2">Entreprise</label>
              <input type="text" value={editForm.company_name || ''} onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#040741] mb-2">Adresse</label>
              <input type="text" value={editForm.address || ''} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {[
          { key: 'factures', label: `Factures (${factures.length})` },
          { key: 'devis', label: `Devis (${devis.length})` },
          { key: 'interactions', label: `Interactions (${interactions.length})` }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[#313ADF] text-[#313ADF]'
                : 'border-transparent text-gray-500 hover:text-[#040741]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content - Factures */}
      {activeTab === 'factures' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          {factures.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Aucune facture pour ce client</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {factures.map(f => (
                <div
                  key={f.id}
                  onClick={() => navigate(`/factures/${f.id}`)}
                  className="px-6 py-4 hover:bg-[#313ADF]/5 cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-[#040741]">{f.invoice_number || `FAC-${f.id?.slice(0, 6)}`}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(f.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#313ADF]">{f.total_ttc?.toFixed(2)} €</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      f.status === 'payée' ? 'bg-green-100 text-green-600' :
                      f.status === 'envoyée' ? 'bg-blue-100 text-blue-600' :
                      f.status === 'annulée' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {f.status || 'brouillon'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content - Devis */}
      {activeTab === 'devis' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          {devis.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Aucun devis pour ce client</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {devis.map(d => (
                <div
                  key={d.id}
                  onClick={() => navigate(`/devis/${d.id}`)}
                  className="px-6 py-4 hover:bg-[#313ADF]/5 cursor-pointer transition-colors flex items-center justify-between"
                >
                  <div>
                    <p className="font-bold text-[#040741]">{d.quote_ref || `DEV-${d.id?.slice(0, 6)}`}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(d.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#313ADF]">{d.total_amount?.toFixed(2)} €</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      d.status === 'accepted' ? 'bg-green-100 text-green-600' :
                      d.status === 'sent' ? 'bg-blue-100 text-blue-600' :
                      d.status === 'rejected' ? 'bg-red-100 text-red-600' :
                      d.status === 'expired' ? 'bg-orange-100 text-orange-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {d.status === 'accepted' ? 'Accepté' : d.status === 'sent' ? 'Envoyé' : d.status === 'rejected' ? 'Refusé' : d.status === 'expired' ? 'Expiré' : 'Brouillon'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content - Interactions */}
      {activeTab === 'interactions' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          {interactions.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="mb-4">Aucune interaction enregistrée</p>
              <button
                onClick={() => setShowInteractionModal(true)}
                className="bg-[#313ADF]/10 text-[#313ADF] px-6 py-2 rounded-xl font-medium hover:bg-[#313ADF]/20 transition-colors"
              >
                Ajouter une interaction
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {interactions.map(i => (
                <div key={i.id} className="px-6 py-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      i.interaction_type === 'appel' ? 'bg-green-100 text-green-600' :
                      i.interaction_type === 'email' ? 'bg-blue-100 text-blue-600' :
                      i.interaction_type === 'reunion' ? 'bg-purple-100 text-purple-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {getInteractionIcon(i.interaction_type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-[#040741] text-sm">
                          {interactionTypeLabel[i.interaction_type] || 'Note'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(i.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm">{i.notes}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Interaction */}
      {showInteractionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#040741]">Nouvelle interaction</h2>
              <button onClick={() => setShowInteractionModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Type</label>
                <div className="flex gap-2">
                  {['appel', 'email', 'reunion', 'note'].map(type => (
                    <button
                      key={type}
                      onClick={() => setInteractionForm({ ...interactionForm, interaction_type: type })}
                      className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                        interactionForm.interaction_type === type
                          ? 'bg-[#313ADF] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {interactionTypeLabel[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Notes *</label>
                <textarea
                  value={interactionForm.notes}
                  onChange={(e) => setInteractionForm({ ...interactionForm, notes: e.target.value })}
                  placeholder="Détails de l'interaction..."
                  rows={4}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
                />
              </div>

              <button
                onClick={handleAddInteraction}
                disabled={interactionLoading}
                className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {interactionLoading ? 'Ajout...' : 'Ajouter l\'interaction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bouton Retour */}
      <button
        onClick={() => navigate('/clients')}
        className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour aux clients
      </button>
    </div>
  )
}
