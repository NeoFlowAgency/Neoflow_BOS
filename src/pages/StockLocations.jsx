import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Warehouse, Eye, Pencil, Trash2, Plus, ArrowLeft, Star, X, AlertTriangle, MapPin, Info } from 'lucide-react'
import { listStockLocations, createStockLocation, updateStockLocation, deleteStockLocation } from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const LOCATION_TYPES = [
  { value: 'store', label: 'Magasin', icon: Store, color: 'text-blue-600', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
  { value: 'warehouse', label: 'Dépôt', icon: Warehouse, color: 'text-purple-600', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700' },
  { value: 'display', label: 'Exposition', icon: Eye, color: 'text-green-600', bg: 'bg-green-50', badge: 'bg-green-100 text-green-700' }
]

function getTypeConfig(type) {
  return LOCATION_TYPES.find(t => t.value === type) || LOCATION_TYPES[1]
}

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
        toast.success('Emplacement mis à jour')
      } else {
        await createStockLocation(workspace.id, {
          name: formData.name.trim(),
          type: formData.type,
          address: formData.address.trim() || null
        })
        toast.success('Emplacement créé')
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
      toast.success('Emplacement supprimé')
      setDeleteConfirm(null)
      loadLocations()
    } catch (err) {
      toast.error(err.message || 'Impossible de supprimer cet emplacement')
      setDeleteConfirm(null)
    }
  }

  const deleteTarget = locations.find(l => l.id === deleteConfirm)

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-3xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Emplacements stock</h1>
          <p className="text-gray-500 mt-0.5">Gérez vos lieux de stockage</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-[#313ADF] text-white px-5 py-3 rounded-xl font-semibold hover:bg-[#4149e8] transition-colors shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Nouvel emplacement
        </button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Les emplacements représentent vos lieux de stockage physiques (magasins, dépôts, zones d'exposition).
          Chaque produit peut avoir un niveau de stock différent par emplacement.
        </p>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Warehouse className="w-8 h-8 text-gray-400" />
          </div>
          <p className="font-semibold text-[#040741] mb-1">Aucun emplacement configuré</p>
          <p className="text-sm text-gray-400 mb-5">Créez votre premier lieu de stockage pour commencer à gérer votre stock.</p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 bg-[#313ADF] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-[#4149e8] transition-colors text-sm"
          >
            <Plus className="w-4 h-4" />
            Créer un emplacement
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map(loc => {
            const cfg = getTypeConfig(loc.type)
            const TypeIcon = cfg.icon
            return (
              <div key={loc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-12 h-12 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <TypeIcon className={`w-6 h-6 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[#040741]">{loc.name}</p>
                      {loc.is_default && (
                        <span className="inline-flex items-center gap-1 text-xs bg-[#313ADF]/10 text-[#313ADF] px-2 py-0.5 rounded-full font-medium">
                          <Star className="w-3 h-3" />
                          Par défaut
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {loc.address && (
                      <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1 truncate">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        {loc.address}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                  <button
                    onClick={() => openEditModal(loc)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Modifier"
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </button>
                  {!loc.is_default && (
                    <button
                      onClick={() => setDeleteConfirm(loc.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Retour */}
      <button
        onClick={() => navigate('/stock')}
        className="mt-8 inline-flex items-center gap-2 px-4 py-2.5 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour au stock
      </button>

      {/* Modal création/édition */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-[#040741]">
                {editingLocation ? "Modifier l'emplacement" : 'Nouvel emplacement'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Nom */}
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">
                  Nom <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Dépôt principal"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]/40"
                  autoFocus
                />
              </div>

              {/* Type — visual grid */}
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {LOCATION_TYPES.map(t => {
                    const TIcon = t.icon
                    const selected = formData.type === t.value
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: t.value })}
                        className={`flex flex-col items-center gap-2 px-3 py-3.5 rounded-xl font-medium text-sm transition-all border-2 ${
                          selected
                            ? 'border-[#313ADF] bg-[#313ADF]/5 text-[#313ADF]'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        <TIcon className={`w-5 h-5 ${selected ? 'text-[#313ADF]' : t.color}`} />
                        <span>{t.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Adresse */}
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">
                  Adresse <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="15 rue des Lilas, 44000 Nantes"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]/40"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Enregistrement...' : editingLocation ? 'Mettre à jour' : 'Créer'}
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
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-[#040741] mb-1">Supprimer cet emplacement ?</h3>
            {deleteTarget && (
              <p className="text-sm font-medium text-[#313ADF] mb-2">« {deleteTarget.name} »</p>
            )}
            <p className="text-sm text-gray-500 mb-6">Les niveaux de stock associés à cet emplacement seront perdus. Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
