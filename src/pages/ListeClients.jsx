import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function ListeClients() {
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const toast = useToast()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', address: ''
  })

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    loadClients()
  }, [workspace?.id, wsLoading])

  const loadClients = async () => {
    try {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('workspace_id', workspace?.id)
        .order('created_at', { ascending: false })

      setClients(data || [])
    } catch (err) {
      console.error('[ListeClients] Erreur:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredClients = clients.filter(c => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      c.first_name?.toLowerCase().includes(term) ||
      c.last_name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.phone?.includes(term) ||
      c.company_name?.toLowerCase().includes(term)
    )
  })

  const handleCreate = async () => {
    if (!form.first_name || !form.last_name) {
      toast.error('Nom et prénom sont requis')
      return
    }

    setCreateLoading(true)
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
          workspace_id: workspace.id,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null
        })

      if (error) throw error

      toast.success('Client créé avec succès !')
      setShowModal(false)
      setForm({ first_name: '', last_name: '', email: '', phone: '', address: '' })
      loadClients()
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la création')
    } finally {
      setCreateLoading(false)
    }
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
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#040741] mb-1">Mes clients</h1>
          <p className="text-gray-500">{clients.length} clients au total</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau client
        </button>
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <svg className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
          />
        </div>
      </div>

      {/* Liste clients */}
      {filteredClients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-12 text-center">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <p className="text-gray-500 mb-6 text-lg">
            {searchTerm ? 'Aucun client trouvé' : 'Aucun client pour le moment'}
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Ajouter votre premier client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/clients/${c.id}`)}
              className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-[#313ADF]/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-[#313ADF]/20 transition-colors">
                  <span className="text-lg font-bold text-[#313ADF]">
                    {c.first_name?.charAt(0)}{c.last_name?.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#040741] text-lg truncate">
                    {c.first_name} {c.last_name}
                  </p>
                  {c.company_name && (
                    <p className="text-sm text-[#313ADF] font-medium">{c.company_name}</p>
                  )}
                  {c.email && (
                    <p className="text-sm text-gray-500 truncate mt-1">{c.email}</p>
                  )}
                  {c.phone && (
                    <p className="text-sm text-gray-500">{c.phone}</p>
                  )}
                </div>
                <svg className="w-5 h-5 text-gray-300 group-hover:text-[#313ADF] transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nouveau Client */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#040741]">Nouveau client</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Prénom *</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    placeholder="Jean"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Nom *</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    placeholder="Dupont"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jean@email.com"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Téléphone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="06 12 34 56 78"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Adresse</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="15 rue des Lilas, 75001 Paris"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>

              <button
                onClick={handleCreate}
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
                  'Créer le client'
                )}
              </button>
            </div>
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
