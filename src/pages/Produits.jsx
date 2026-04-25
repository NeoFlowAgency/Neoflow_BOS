import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { canViewMargins } from '../lib/permissions'
import { downloadCSV } from '../lib/csvExport'
import { listVariants, createVariant, archiveVariant } from '../services/variantService'

const CATEGORIES = [
  { value: '', label: 'Sans catégorie' },
  { value: 'matelas', label: 'Matelas' },
  { value: 'sommier', label: 'Sommier' },
  { value: 'literie', label: 'Ensemble literie' },
  { value: 'tete_de_lit', label: 'Tête de lit' },
  { value: 'linge', label: 'Linge de lit' },
  { value: 'oreiller', label: 'Oreiller / Traversin' },
  { value: 'couette', label: 'Couette' },
  { value: 'accessoire', label: 'Accessoire' },
  { value: 'meuble', label: 'Meuble' },
  { value: 'autre', label: 'Autre' },
]

export default function Produits() {
  const { workspace, role, loading: wsLoading } = useWorkspace()
  const toast = useToast()
  const [produits, setProduits] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const showMargins = canViewMargins(role)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [form, setForm] = useState({
    name: '', description: '', unit_price_ht: '', tax_rate: '20',
    reference: '', cost_price_ht: '', technical_sheet: '', category: ''
  })
  const [saveLoading, setSaveLoading] = useState(false)

  // Variantes
  const [hasVariants, setHasVariants] = useState(false)
  const [variants, setVariants] = useState([])
  const [variantForm, setVariantForm] = useState({ size: '', comfort: 'medium', price: '', purchase_price: '', sku_supplier: '' })
  const [variantsLoading, setVariantsLoading] = useState(false)
  const [addingVariant, setAddingVariant] = useState(false)

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

  const resetVariantState = () => {
    setHasVariants(false)
    setVariants([])
    setVariantForm({ size: '', comfort: 'medium', price: '', purchase_price: '', sku_supplier: '' })
    setAddingVariant(false)
  }

  const openCreate = () => {
    setEditingProduct(null)
    setForm({
      name: '', description: '', unit_price_ht: '', tax_rate: '20',
      reference: '', cost_price_ht: '', technical_sheet: '', category: '',
      eco_participation_amount: '', warranty_years: ''
    })
    resetVariantState()
    setShowModal(true)
  }

  const openEdit = (product) => {
    setEditingProduct(product)
    setForm({
      name: product.name || '',
      description: product.description || '',
      unit_price_ht: product.unit_price_ht?.toString() || '',
      tax_rate: product.tax_rate?.toString() || '20',
      reference: product.reference || '',
      cost_price_ht: product.cost_price_ht?.toString() || '',
      technical_sheet: product.technical_sheet || '',
      category: product.category || '',
      eco_participation_amount: product.eco_participation_amount?.toString() || '',
      warranty_years: product.warranty_years?.toString() || ''
    })
    resetVariantState()
    setHasVariants(product.has_variants || false)
    if (product.has_variants && product.id) {
      setVariantsLoading(true)
      listVariants(product.id).then(v => { setVariants(v); setVariantsLoading(false) })
    }
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
        tax_rate: parseFloat(form.tax_rate) || 20,
        reference: form.reference.trim() || null,
        cost_price_ht: form.cost_price_ht ? parseFloat(form.cost_price_ht) : null,
        technical_sheet: form.technical_sheet.trim() || null,
        category: form.category || null,
        has_variants: hasVariants,
        eco_participation_amount: parseFloat(form.eco_participation_amount) || 0,
        warranty_years: parseInt(form.warranty_years) || 0
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
    if (categoryFilter && p.category !== categoryFilter) return false
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      p.name?.toLowerCase().includes(term) ||
      p.description?.toLowerCase().includes(term) ||
      p.reference?.toLowerCase().includes(term)
    )
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV('produits', ['Référence', 'Nom', 'Catégorie', 'Prix HT', 'TVA %', "Prix d'achat HT", 'Garantie (ans)'],
              produits.map(p => [p.reference || '', p.name || '', p.category || '', p.unit_price_ht ?? '', p.tax_rate ?? '', p.cost_price_ht ?? '', p.warranty_years ?? ''])
            )}
            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors"
            title="Exporter CSV"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exporter
          </button>
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
      </div>

      {/* Recherche + Filtre categorie */}
      {produits.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 cursor-pointer"
          >
            <option value="">Toutes catégories</option>
            {CATEGORIES.filter(c => c.value).map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
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
          <div className={`hidden md:grid gap-4 px-6 py-4 bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-500 ${showMargins ? 'grid-cols-16' : 'grid-cols-12'}`}>
            <div className="col-span-1">Ref</div>
            <div className="col-span-3">Nom</div>
            <div className="col-span-2">Catégorie</div>
            <div className="col-span-2 text-right">Prix HT</div>
            <div className="col-span-1 text-center">TVA</div>
            {showMargins && (
              <>
                <div className="col-span-2 text-right">Cout / Marge</div>
              </>
            )}
            <div className={`${showMargins ? 'col-span-2' : 'col-span-3'} text-center`}>Actions</div>
          </div>

          <div className="divide-y divide-gray-100">
            {filteredProduits.map((p) => {
              const margin = (p.unit_price_ht && p.cost_price_ht)
                ? p.unit_price_ht - p.cost_price_ht
                : null
              const marginPercent = (margin !== null && p.unit_price_ht > 0)
                ? (margin / p.unit_price_ht * 100)
                : null
              const categoryLabel = CATEGORIES.find(c => c.value === p.category)?.label || p.category || '-'

              return (
                <div key={p.id} className="px-4 md:px-6 py-4 hover:bg-gray-50 transition-colors">
                  {/* Mobile layout */}
                  <div className="md:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-[#040741]">{p.name}</p>
                          {p.reference && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{p.reference}</span>
                          )}
                        </div>
                        {p.category && (
                          <span className="inline-block text-xs text-[#313ADF] bg-[#313ADF]/10 px-2 py-0.5 rounded mt-1">{categoryLabel}</span>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-gray-500">Prix HT:</span>
                          <span className="font-bold text-[#313ADF]">{p.unit_price_ht?.toFixed(2)} €</span>
                          <span className="text-xs text-gray-500">TVA:</span>
                          <span className="text-gray-600 text-sm">{p.tax_rate || 20}%</span>
                        </div>
                        {showMargins && margin !== null && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">Marge:</span>
                            <span className={`text-sm font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {margin.toFixed(2)} € ({marginPercent?.toFixed(1)}%)
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
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
                  </div>

                  {/* Desktop layout */}
                  <div className={`hidden md:grid gap-4 items-center ${showMargins ? 'grid-cols-16' : 'grid-cols-12'}`}>
                    <div className="col-span-1">
                      <span className="text-xs text-gray-400 font-mono">{p.reference || '-'}</span>
                    </div>
                    <div className="col-span-3">
                      <p className="font-bold text-[#040741]">{p.name}</p>
                      {p.description && <p className="text-gray-400 text-xs truncate mt-0.5">{p.description}</p>}
                    </div>
                    <div className="col-span-2">
                      {p.category ? (
                        <span className="text-xs text-[#313ADF] bg-[#313ADF]/10 px-2 py-1 rounded">{categoryLabel}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="font-bold text-[#313ADF]">{p.unit_price_ht?.toFixed(2)} €</p>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className="text-gray-500 text-sm">{p.tax_rate || 20}%</span>
                    </div>
                    {showMargins && (
                      <div className="col-span-2 text-right">
                        {margin !== null ? (
                          <div>
                            <p className="text-xs text-gray-400">{p.cost_price_ht?.toFixed(2)} €</p>
                            <p className={`text-sm font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              +{margin.toFixed(2)} € ({marginPercent?.toFixed(1)}%)
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </div>
                    )}
                    <div className={`${showMargins ? 'col-span-2' : 'col-span-3'} flex justify-center gap-2`}>
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
                </div>
              )
            })}
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
              <button onClick={() => { setShowModal(false); resetVariantState() }} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Nom du produit *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Matelas Premium 160x200"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Reference</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    placeholder="Ex: MAT-160-PREM"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Categorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 cursor-pointer"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
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
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Prix vente HT (€) *</label>
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

              {showMargins && (
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Prix d'achat HT (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_price_ht}
                    onChange={(e) => setForm({ ...form, cost_price_ht: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Fiche technique</label>
                <textarea
                  value={form.technical_sheet}
                  onChange={(e) => setForm({ ...form, technical_sheet: e.target.value })}
                  placeholder="Dimensions, materiaux, fermete, garantie..."
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
                />
              </div>

              {/* Resume prix */}
              {form.unit_price_ht && (
                <div className="bg-[#313ADF]/5 rounded-xl p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Prix vente HT</span>
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
                  {showMargins && form.cost_price_ht && (
                    <>
                      <div className="flex justify-between text-sm mt-2 pt-2 border-t border-[#313ADF]/20">
                        <span className="text-gray-600">Prix d'achat HT</span>
                        <span className="font-medium text-[#040741]">{parseFloat(form.cost_price_ht || 0).toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="font-semibold text-gray-700">Marge</span>
                        {(() => {
                          const m = parseFloat(form.unit_price_ht || 0) - parseFloat(form.cost_price_ht || 0)
                          const mp = parseFloat(form.unit_price_ht) > 0 ? (m / parseFloat(form.unit_price_ht) * 100) : 0
                          return (
                            <span className={`font-bold ${m >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {m.toFixed(2)} € ({mp.toFixed(1)}%)
                            </span>
                          )
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Éco-participation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Éco-participation (€)
                  <span className="text-xs text-gray-400 ml-1">obligatoire literie</span>
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={form.eco_participation_amount}
                  onChange={e => setForm(f => ({ ...f, eco_participation_amount: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                  placeholder="ex: 5.50"
                />
              </div>

              {/* Garantie */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Garantie constructeur (années)</label>
                <input
                  type="number" min="0" max="25"
                  value={form.warranty_years}
                  onChange={e => setForm(f => ({ ...f, warranty_years: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                  placeholder="ex: 5"
                />
              </div>

              {/* Toggle variantes */}
              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="has_variants"
                  checked={hasVariants}
                  onChange={e => setHasVariants(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="has_variants" className="text-sm font-medium text-gray-700">
                  Ce produit a des tailles / conforts différents
                </label>
              </div>

              {/* Section variantes */}
              {hasVariants && (
                <div className="border-t pt-4 mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-700">Variantes</p>
                    <button
                      type="button"
                      onClick={() => setAddingVariant(true)}
                      className="text-xs text-[#313ADF] font-medium hover:underline"
                    >
                      + Ajouter une taille
                    </button>
                  </div>

                  {variantsLoading && <p className="text-xs text-gray-400">Chargement...</p>}

                  {variants.map(v => (
                    <div key={v.id} className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded-lg text-sm">
                      <span className="font-medium w-20">{v.size}</span>
                      <span className="text-gray-500 w-16">{v.comfort || '—'}</span>
                      <span className="flex-1">{Number(v.price).toFixed(2)} €</span>
                      <button
                        type="button"
                        onClick={() => archiveVariant(v.id).then(() => setVariants(vv => vv.filter(x => x.id !== v.id)))}
                        className="text-red-400 hover:text-red-600 text-xs"
                      >
                        Suppr.
                      </button>
                    </div>
                  ))}

                  {addingVariant && (
                    <div className="bg-blue-50 rounded-xl p-3 mt-2 space-y-2">
                      <div className="flex gap-2">
                        <input
                          placeholder="Taille (ex: 160x200)"
                          value={variantForm.size}
                          onChange={e => setVariantForm(f => ({ ...f, size: e.target.value }))}
                          className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                        />
                        <select
                          value={variantForm.comfort}
                          onChange={e => setVariantForm(f => ({ ...f, comfort: e.target.value }))}
                          className="border rounded-lg px-2 py-1.5 text-sm"
                        >
                          <option value="">Sans</option>
                          <option value="souple">Souple</option>
                          <option value="medium">Medium</option>
                          <option value="ferme">Ferme</option>
                          <option value="tres_souple">Très souple</option>
                          <option value="tres_ferme">Très ferme</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          placeholder="Prix TTC (€)"
                          type="number" step="0.01"
                          value={variantForm.price}
                          onChange={e => setVariantForm(f => ({ ...f, price: e.target.value }))}
                          className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Réf. fournisseur"
                          value={variantForm.sku_supplier}
                          onChange={e => setVariantForm(f => ({ ...f, sku_supplier: e.target.value }))}
                          className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => setAddingVariant(false)}
                          className="text-xs text-gray-500 hover:underline">Annuler</button>
                        <button
                          type="button"
                          disabled={!variantForm.size || !variantForm.price}
                          onClick={async () => {
                            if (!editingProduct?.id) return
                            const v = await createVariant(workspace.id, editingProduct.id, variantForm)
                            setVariants(vv => [...vv, v])
                            setVariantForm({ size: '', comfort: 'medium', price: '', purchase_price: '', sku_supplier: '' })
                            setAddingVariant(false)
                          }}
                          className="text-xs bg-[#313ADF] text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          Ajouter
                        </button>
                      </div>
                    </div>
                  )}
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
