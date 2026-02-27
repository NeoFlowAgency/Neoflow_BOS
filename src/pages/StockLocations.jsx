import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listStockLocations, createStockLocation, updateStockLocation, deleteStockLocation } from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const LOCATION_TYPES = [
  { value: 'store', label: 'Magasin' },
  { value: 'warehouse', label: 'Depot' },
  { value: 'display', label: 'Exposition' }
]

export default function StockLocations() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingLocation, setEditingLocation] = useState(null)
  const [formData, setFormData] = useState({ name: '', type: 'warehouse', address: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    if (workspace?.id) loadLocations()
  }, [workspace?.id])

  const loadLocations = async () => {
    setLoading(true)
    try {
      const data = await listStockLocations(workspace.id)
      setLocations(data)
    } catch (err) {
      console.error('Erreur chargement emplacements:', err)
      toast.error('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingLocation(null)
    setFormData({ name: '', type: 'warehouse', address: '' })
    setShowModal(true)
  }

  const openEditModal = (loc) => {
    setEditingLocation(loc)
    setFormData({ name: loc.name, type: loc.type, address: loc.address || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Le nom est obligatoire')
      return
    }
    setSaving(true)
    try {
      if (editingLocation) {
        await updateStockLocation(editingLocation.id, {
          name: formData.name.trim(),
          type: formData.type,
          address: formData.address.trim() || null
        })
        toast.success('Emplacement mis a jour')
      } else {
        await createStockLocation(workspace.id, {
          name: formData.name.trim(),
          type: formData.type,
          address: formData.address.trim() || null
        })
        toast.success('Emplacement cree')
      }
      setShowModal(false)
      loadLocations()
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (locId) => {
    try {
      await deleteStockLocation(locId)
      toast.success('Emplacement supprime')
      setDeleteConfirm(null)
      loadLocations()
    } catch (err) {
      toast.error(err.message || 'Impossible de supprimer cet emplacement')
      setDeleteConfirm(null)
    }
  }

  const getTypeLabel = (type) => LOCATION_TYPES.find(t => t.value === type)?.label || type
  const getTypeColor = (type) => {
    switch (type) {
      case 'store': return 'bg-blue-100 text-blue-700'
      case 'warehouse': return 'bg-purple-100 text-purple-700'
      case 'display': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-3xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Emplacements stock</h1>
          <p className="text-gray-500">Gerez vos lieux de stockage</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-[#313ADF] text-white px-5 py-3 rounded-xl font-semibold hover:bg-[#4149e8] transition-colors shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvel emplacement
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 mb-4">Aucun emplacement configure</p>
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map(loc => (
            <div key={loc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  {loc.type === 'store' ? (
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  ) : loc.type === 'warehouse' ? (
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#040741]">{loc.name}</p>
                    {loc.is_default && (
                      <span className="text-xs bg-[#313ADF]/10 text-[#313ADF] px-2 py-0.5 rounded-full font-medium">Par defaut</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getTypeColor(loc.type)}`}>
                      {getTypeLabel(loc.type)}
                    </span>
                  </div>
                  {loc.address && <p className="text-sm text-gray-400 mt-0.5">{loc.address}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(loc)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Modifier"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {!loc.is_default && (
                  <button
                    onClick={() => setDeleteConfirm(loc.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Retour */}
      <button
        onClick={() => navigate('/stock')}
        className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour au stock
      </button>

      {/* Modal creation/edition */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-[#040741] mb-6">
              {editingLocation ? 'Modifier l\'emplacement' : 'Nouvel emplacement'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Nom <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Depot principal"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Type</label>
                <div className="flex gap-2">
                  {LOCATION_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: t.value })}
                      className={`flex-1 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                        formData.type === t.value
                          ? 'bg-[#313ADF] text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Adresse (optionnel)</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="15 rue des Lilas, 75001 Paris"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] disabled:opacity-50">
                {saving ? 'Enregistrement...' : editingLocation ? 'Mettre a jour' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#040741] mb-2">Supprimer l'emplacement ?</h3>
            <p className="text-sm text-gray-500 mb-6">Les niveaux de stock associes seront perdus.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200">
                Annuler
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
