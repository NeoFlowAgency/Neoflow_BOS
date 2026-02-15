import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function Produits() {
  const { workspace, loading: wsLoading } = useWorkspace()
  const toast = useToast()
  const [produits, setProduits] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', unit_price_ht: '', tax_rate: '20' })
  const [saveLoading, setSaveLoading] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    loadProduits()
  }, [workspace?.id, wsLoading])

  const loadProduits = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspace?.id)
        .or('is_archived.is.null,is_archived.eq.false')
        .order('created_at', { ascending: false })

      if (error) throw error
      setProduits(data || [])
    } catch (err) {
      console.error('[Produits] Erreur chargement:', err.message)
      toast.error('Erreur chargement des produits: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditingProduct(null)
    setForm({ name: '', description: '', unit_price_ht: '', tax_rate: '20' })
    setShowModal(true)
  }

  const openEdit = (product) => {
    setEditingProduct(product)
    setForm({
      name: product.name || '',
      description: product.description || '',
      unit_price_ht: product.unit_price_ht?.toString() || '',
      tax_rate: product.tax_rate?.toString() || '20'
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom du produit est requis')
      return
    }
    if (!form.unit_price_ht || parseFloat(form.unit_price_ht) < 0) {
      toast.error('Le prix HT est requis')
      return
    }

    setSaveLoading(true)
    try {
      const productData = {
        workspace_id: workspace.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        unit_price_ht: parseFloat(form.unit_price_ht),
        tax_rate: parseFloat(form.tax_rate) || 20
      }

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)
          .eq('workspace_id', workspace.id)

        if (error) throw error
        toast.success('Produit mis à jour !')
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData)

        if (error) throw error
        toast.success('Produit créé !')
      }

      setShowModal(false)
      loadProduits()
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_archived: true })
        .eq('id', id)
        .eq('workspace_id', workspace.id)

      if (error) throw error
      toast.success('Produit supprimé')
      setDeleteId(null)
      loadProduits()
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la suppression')
    }
  }

  const filteredProduits = produits.filter(p => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return p.name?.toLowerCase().includes(term) || p.description?.toLowerCase().includes(term)
  })

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
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">Produits</h1>
          <p className="text-gray-500">{produits.length} produit{produits.length > 1 ? 's' : ''} au total</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau produit
        </button>
      </div>

      {/* Recherche */}
      {produits.length > 0 && (
        <div className="mb-6">
          <div className="relative max-w-md">
            <svg className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>
        </div>
      )}

      {/* Liste produits */}
      {filteredProduits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-12 text-center">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <p className="text-gray-500 mb-2 text-lg">
            {searchTerm ? 'Aucun produit trouvé' : 'Aucun produit pour le moment'}
          </p>
          <p className="text-gray-400 text-sm mb-6">
            Ajoutez des produits pour pouvoir créer des factures et devis
          </p>
          <button
            onClick={openCreate}
            className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Ajouter votre premier produit
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-500">
            <div className="col-span-4">Nom</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-2 text-right">Prix HT</div>
            <div className="col-span-1 text-center">TVA</div>
            <div className="col-span-2 text-center">Actions</div>
          </div>

          <div className="divide-y divide-gray-100">
            {filteredProduits.map((p) => (
              <div key={p.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-colors">
                <div className="md:col-span-4">
                  <p className="font-bold text-[#040741]">{p.name}</p>
                </div>
                <div className="md:col-span-3">
                  <p className="text-gray-500 text-sm truncate">{p.description || '-'}</p>
                </div>
                <div className="md:col-span-2 text-right">
                  <p className="font-bold text-[#313ADF]">{p.unit_price_ht?.toFixed(2)} €</p>
                </div>
                <div className="md:col-span-1 text-center">
                  <span className="text-gray-500 text-sm">{p.tax_rate || 20}%</span>
                </div>
                <div className="md:col-span-2 flex justify-center gap-2">
                  <button
                    onClick={() => openEdit(p)}
                    className="p-2 text-[#313ADF] hover:bg-[#313ADF]/10 rounded-lg transition-colors"
                    title="Modifier"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {deleteId === p.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => handleDelete(p.id)} className="px-2 py-1 bg-red-500 text-white rounded-lg text-xs font-medium">Oui</button>
                      <button onClick={() => setDeleteId(null)} className="px-2 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs font-medium">Non</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteId(p.id)}
                      className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Créer/Modifier */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#040741]">
                {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Nom du produit *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Matelas Premium 160x200"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Description du produit..."
                  rows={2}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Prix unitaire HT (€) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_price_ht}
                    onChange={(e) => setForm({ ...form, unit_price_ht: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Taux TVA (%)</label>
                  <select
                    value={form.tax_rate}
                    onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 cursor-pointer"
                  >
                    <option value="0">0%</option>
                    <option value="5.5">5.5%</option>
                    <option value="10">10%</option>
                    <option value="20">20%</option>
                  </select>
                </div>
              </div>

              {form.unit_price_ht && (
                <div className="bg-[#313ADF]/5 rounded-xl p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Prix HT</span>
                    <span className="font-medium text-[#040741]">{parseFloat(form.unit_price_ht || 0).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-600">TVA ({form.tax_rate}%)</span>
                    <span className="font-medium text-[#040741]">{(parseFloat(form.unit_price_ht || 0) * parseFloat(form.tax_rate || 0) / 100).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-[#313ADF]/20">
                    <span className="font-bold text-[#040741]">Prix TTC</span>
                    <span className="font-bold text-[#313ADF]">
                      {(parseFloat(form.unit_price_ht || 0) * (1 + parseFloat(form.tax_rate || 0) / 100)).toFixed(2)} €
                    </span>
                  </div>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saveLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Sauvegarde...
                  </>
                ) : (
                  editingProduct ? 'Mettre à jour' : 'Créer le produit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
