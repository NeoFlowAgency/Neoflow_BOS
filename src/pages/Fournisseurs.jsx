import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSuppliers, createSupplier, updateSupplier, archiveSupplier } from '../services/supplierService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function Fournisseurs() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', address: '', city: '', postal_code: '', country: 'France', notes: '' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  useEffect(() => {
    if (workspace?.id) loadSuppliers()
  }, [workspace?.id])

  const loadSuppliers = async () => {
    setLoading(true)
    try {
      const data = await listSuppliers(workspace.id)
      setSuppliers(data)
    } catch (err) {
      console.error('Erreur:', err)
      toast.error('Erreur lors du chargement des fournisseurs')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditingSupplier(null)
    setForm({ name: '', contact_name: '', email: '', phone: '', address: '', city: '', postal_code: '', country: 'France', notes: '' })
    setShowModal(true)
  }

  const openEdit = (s) => {
    setEditingSupplier(s)
    setForm({
      name: s.name || '',
      contact_name: s.contact_name || '',
      email: s.email || '',
      phone: s.phone || '',
      address: s.address || '',
      city: s.city || '',
      postal_code: s.postal_code || '',
      country: s.country || 'France',
      notes: s.notes || ''
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom est obligatoire')
      return
    }
    setSaving(true)
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, form)
        toast.success('Fournisseur mis a jour')
      } else {
        await createSupplier(workspace.id, form)
        toast.success('Fournisseur cree')
      }
      setShowModal(false)
      loadSuppliers()
    } catch (err) {
      toast.error(err.message || 'Erreur sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (id) => {
    try {
      await archiveSupplier(id)
      toast.success('Fournisseur archive')
      setDeleteConfirm(null)
      loadSuppliers()
    } catch (err) {
      toast.error(err.message || 'Erreur archivage')
    }
  }

  const filteredSuppliers = suppliers.filter(s => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return s.name?.toLowerCase().includes(term) || s.contact_name?.toLowerCase().includes(term) || s.email?.toLowerCase().includes(term) || s.phone?.includes(term)
  })

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Fournisseurs</h1>
          <p className="text-gray-500">{filteredSuppliers.length} fournisseur{filteredSuppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#313ADF] text-white px-5 py-3 rounded-xl font-semibold hover:bg-[#4149e8] transition-colors shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau fournisseur
        </button>
      </div>

      {/* Recherche */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom, contact, email..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] shadow-sm"
          />
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">{searchTerm ? 'Aucun fournisseur correspondant' : 'Aucun fournisseur pour le moment'}</p>
          <button onClick={openCreate} className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold hover:bg-[#4149e8] transition-colors">
            Ajouter un fournisseur
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSuppliers.map(s => (
            <div
              key={s.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/fournisseurs/${s.id}`)}
            >
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-[#313ADF]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-[#313ADF] font-bold text-lg">{s.name?.charAt(0)?.toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#040741] truncate">{s.name}</p>
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      {s.contact_name && <span>{s.contact_name}</span>}
                      {s.phone && <span>{s.phone}</span>}
                      {s.city && <span>{s.city}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(s)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Modifier">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => setDeleteConfirm(s.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Archiver">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                  <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal creation/edition */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full my-8">
            <h3 className="text-lg font-bold text-[#040741] mb-6">
              {editingSupplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Nom <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Bultex France"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Nom du contact</label>
                  <input type="text" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Jean Dupont"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Telephone</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01 23 45 67 89"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@fournisseur.com"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Adresse</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="15 rue des Lilas"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Code postal</label>
                  <input type="text" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="75001"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Ville</label>
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Paris"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Pays</label>
                  <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Informations complementaires..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] disabled:opacity-50">
                {saving ? 'Enregistrement...' : editingSupplier ? 'Mettre a jour' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation archivage */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#040741] mb-2">Archiver le fournisseur ?</h3>
            <p className="text-sm text-gray-500 mb-6">Il n'apparaitra plus dans la liste mais ses donnees seront conservees.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200">Annuler</button>
              <button onClick={() => handleArchive(deleteConfirm)} className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600">Archiver</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
