import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { listSuppliers, createPurchaseOrder } from '../services/supplierService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function CreerBonCommande() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fournisseur
  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState(searchParams.get('fournisseur') || '')
  const [suppliersLoading, setSuppliersLoading] = useState(false)

  // Produits
  const [produits, setProduits] = useState([])
  const [produitsLoading, setProduitsLoading] = useState(false)
  const [lignes, setLignes] = useState([
    { id: 1, product_id: null, product_name: '', quantity_ordered: 1, unit_cost_ht: 0, tax_rate: 20, total_ht: 0 }
  ])

  // Options
  const [expectedDate, setExpectedDate] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (workspace?.id) {
      loadSuppliers()
      loadProduits()
    }
  }, [workspace?.id])

  const loadSuppliers = async () => {
    setSuppliersLoading(true)
    try {
      const data = await listSuppliers(workspace.id)
      setSuppliers(data)
    } catch (err) {
      console.error('Erreur:', err)
    } finally {
      setSuppliersLoading(false)
    }
  }

  const loadProduits = async () => {
    setProduitsLoading(true)
    try {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspace.id)
        .eq('is_archived', false)
        .order('name')
      setProduits(data || [])
    } catch (err) {
      console.error('Erreur:', err)
    } finally {
      setProduitsLoading(false)
    }
  }

  const handleProduitChange = (ligneId, produitId) => {
    const produit = produits.find(p => p.id === produitId)
    if (!produit) return
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? {
        ...l,
        product_id: produit.id,
        product_name: produit.name,
        unit_cost_ht: produit.cost_price_ht || 0,
        total_ht: (produit.cost_price_ht || 0) * l.quantity_ordered
      } : l
    ))
  }

  const handleQuantiteChange = (ligneId, newQty) => {
    const qty = Math.max(1, parseInt(newQty) || 1)
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, quantity_ordered: qty, total_ht: l.unit_cost_ht * qty } : l
    ))
  }

  const handleCostChange = (ligneId, newCost) => {
    const cost = parseFloat(newCost) || 0
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, unit_cost_ht: cost, total_ht: cost * l.quantity_ordered } : l
    ))
  }

  const ajouterLigne = () => {
    const newId = Math.max(...lignes.map(l => l.id), 0) + 1
    setLignes([...lignes, { id: newId, product_id: null, product_name: '', quantity_ordered: 1, unit_cost_ht: 0, tax_rate: 20, total_ht: 0 }])
  }

  const supprimerLigne = (ligneId) => {
    if (lignes.length <= 1) return
    setLignes(prev => prev.filter(l => l.id !== ligneId))
  }

  const round = (num) => Math.round(num * 100) / 100

  const calculerTotaux = () => {
    const totalHt = lignes.reduce((sum, l) => sum + l.unit_cost_ht * l.quantity_ordered, 0)
    const totalTva = totalHt * 0.20
    const totalTtc = totalHt + totalTva
    return { totalHt: round(totalHt), totalTva: round(totalTva), totalTtc: round(totalTtc) }
  }

  const totaux = calculerTotaux()

  const handleSubmit = async () => {
    setError('')

    if (!supplierId) {
      setError('Veuillez selectionner un fournisseur')
      return
    }

    const lignesValides = lignes.filter(l => l.product_id !== null)
    if (lignesValides.length === 0) {
      setError('Veuillez ajouter au moins un produit')
      return
    }

    if (!workspace?.id) {
      setError('Aucun workspace actif')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifie')

      const items = lignesValides.map(l => ({
        product_id: l.product_id,
        quantity_ordered: l.quantity_ordered,
        unit_cost_ht: l.unit_cost_ht,
        tax_rate: l.tax_rate,
        total_ht: round(l.unit_cost_ht * l.quantity_ordered)
      }))

      const po = await createPurchaseOrder(workspace.id, user.id, supplierId, items, {
        expected_date: expectedDate || null,
        notes
      })

      toast.success('Bon de commande cree !')
      navigate(`/bons-commande/${po.id}`)
    } catch (err) {
      console.error('Erreur creation bon commande:', err)
      setError(err.message || 'Erreur lors de la creation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-2">Nouveau bon de commande</h1>
        <p className="text-gray-500">Commander des produits aupres d'un fournisseur</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Fournisseur */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-[#040741] mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Fournisseur
        </h2>

        <div className="relative max-w-md">
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={suppliersLoading}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 disabled:opacity-50"
          >
            {suppliersLoading ? (
              <option value="">Chargement...</option>
            ) : (
              <>
                <option value="">Selectionner un fournisseur</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </>
            )}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Lignes produits */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-[#040741] mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          Produits a commander
        </h2>

        {/* En-tetes desktop */}
        <div className="hidden md:grid grid-cols-12 gap-4 mb-3 px-2">
          <div className="col-span-5 text-sm font-medium text-gray-500">Produit</div>
          <div className="col-span-2 text-sm font-medium text-gray-500 text-center">Quantite</div>
          <div className="col-span-2 text-sm font-medium text-gray-500 text-center">Cout unit. HT</div>
          <div className="col-span-2 text-sm font-medium text-gray-500 text-center">Total HT</div>
          <div className="col-span-1"></div>
        </div>

        <div className="space-y-3">
          {lignes.map(ligne => (
            <div key={ligne.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-gray-50 rounded-xl p-3">
              <div className="md:col-span-5 relative">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Produit</span>
                <select
                  value={ligne.product_id || ''}
                  onChange={(e) => handleProduitChange(ligne.id, e.target.value)}
                  disabled={produitsLoading}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 disabled:opacity-50"
                >
                  {produitsLoading ? (
                    <option value="">Chargement...</option>
                  ) : (
                    <>
                      <option value="">Selectionner un produit</option>
                      {produits.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.reference ? `${p.reference} - ` : ''}{p.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none md:top-1/2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="md:col-span-2">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Quantite</span>
                <input
                  type="number"
                  min={1}
                  value={ligne.quantity_ordered}
                  onChange={(e) => handleQuantiteChange(ligne.id, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-center font-semibold text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>

              <div className="md:col-span-2">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Cout unit. HT</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={ligne.unit_cost_ht || ''}
                  onChange={(e) => handleCostChange(ligne.id, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-center text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-2">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Total HT</span>
                <div className="bg-[#313ADF]/10 border border-[#313ADF]/20 rounded-xl px-3 py-3 text-center font-bold text-[#313ADF]">
                  {(ligne.unit_cost_ht * ligne.quantity_ordered).toFixed(2)} EUR
                </div>
              </div>

              <div className="md:col-span-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => supprimerLigne(ligne.id)}
                  disabled={lignes.length <= 1}
                  className={`p-2 rounded-lg transition-colors ${
                    lignes.length <= 1
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-red-400 hover:text-red-600 hover:bg-red-50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={ajouterLigne}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#313ADF]/10 text-[#313ADF] rounded-xl font-medium hover:bg-[#313ADF]/20 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un produit
        </button>
      </div>

      {/* Options + Recapitulatif */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Options */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
          <h2 className="text-xl font-bold text-[#040741] mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Options
          </h2>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-[#040741] mb-2">Date de livraison prevue</label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instructions, references, conditions..."
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
            />
          </div>
        </div>

        {/* Recapitulatif */}
        <div className="bg-gradient-to-br from-[#040741] to-[#0a0b52] rounded-2xl p-6 text-white">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Recapitulatif
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between text-white/70">
              <span>{lignes.filter(l => l.product_id).length} produit(s)</span>
              <span>{lignes.reduce((s, l) => s + l.quantity_ordered, 0)} unite(s)</span>
            </div>
            <div className="flex justify-between text-white/70">
              <span>Total HT</span>
              <span>{totaux.totalHt.toFixed(2)} EUR</span>
            </div>
            <div className="flex justify-between text-white/70">
              <span>TVA (20%)</span>
              <span>{totaux.totalTva.toFixed(2)} EUR</span>
            </div>
            <div className="border-t border-white/20 pt-4 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">Total TTC</span>
                <span className="text-3xl font-bold text-[#313ADF]">{totaux.totalTtc.toFixed(2)} EUR</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full mt-6 bg-[#313ADF] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#4149e8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creation en cours...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Creer le bon de commande
              </>
            )}
          </button>
        </div>
      </div>

      {/* Retour */}
      <button
        onClick={() => navigate(supplierId ? `/fournisseurs/${supplierId}` : '/fournisseurs')}
        className="inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour
      </button>

      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-[#313ADF] mx-auto"></div>
            <p className="mt-4 text-[#040741] font-medium">Creation du bon de commande...</p>
          </div>
        </div>
      )}
    </div>
  )
}
