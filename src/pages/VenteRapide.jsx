import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createOrder, createPayment, generateInvoiceFromOrder } from '../services/orderService'
import { getStockLevels, listStockLocations, debitStock } from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function VenteRapide() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()
  const searchRef = useRef(null)

  const [produits, setProduits] = useState([])
  const [produitsLoading, setProduitsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [panier, setPanier] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [remiseType, setRemiseType] = useState('percent')
  const [remiseValeur, setRemiseValeur] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [lastOrder, setLastOrder] = useState(null)

  // Client optionnel
  const [clientSearch, setClientSearch] = useState('')
  const [clientSuggestions, setClientSuggestions] = useState([])
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)

  // Stock
  const [stockMap, setStockMap] = useState({}) // productId -> totalAvailable
  const [defaultLocationId, setDefaultLocationId] = useState(null)

  useEffect(() => {
    if (workspace?.id) loadProduits()
  }, [workspace?.id])

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

      // Load stock levels
      const [levelsData, locData] = await Promise.all([
        getStockLevels(workspace.id),
        listStockLocations(workspace.id)
      ])
      const defaultLoc = locData.find(l => l.is_default) || locData[0]
      if (defaultLoc) setDefaultLocationId(defaultLoc.id)

      const sMap = {}
      for (const sl of levelsData) {
        if (!sl.product) continue
        const pid = sl.product.id
        if (!sMap[pid]) sMap[pid] = 0
        sMap[pid] += (sl.quantity || 0) - (sl.reserved_quantity || 0)
      }
      setStockMap(sMap)
    } catch (err) {
      console.error('Erreur chargement produits:', err)
    } finally {
      setProduitsLoading(false)
    }
  }

  const searchClients = async (term) => {
    if (term.length < 2 || !workspace?.id) {
      setClientSuggestions([])
      setShowClientSuggestions(false)
      return
    }
    try {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('workspace_id', workspace.id)
        .or(`phone.ilike.%${term}%,last_name.ilike.%${term}%,first_name.ilike.%${term}%`)
        .limit(5)
      setClientSuggestions(data || [])
      setShowClientSuggestions((data || []).length > 0)
    } catch (err) {
      console.error('Erreur recherche clients:', err)
    }
  }

  const filteredProduits = produits.filter(p =>
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.reference?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const ajouterAuPanier = (produit) => {
    setPanier(prev => {
      const existing = prev.find(item => item.product_id === produit.id)
      if (existing) {
        return prev.map(item =>
          item.product_id === produit.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, {
        product_id: produit.id,
        description: produit.name,
        quantity: 1,
        unit_price_ht: produit.unit_price_ht || 0,
        cost_price_ht: produit.cost_price_ht || null,
        tax_rate: produit.tax_rate || 20
      }]
    })
    setSearchTerm('')
    searchRef.current?.focus()
  }

  const modifierQuantite = (productId, delta) => {
    setPanier(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQty = Math.max(1, item.quantity + delta)
        return { ...item, quantity: newQty }
      }
      return item
    }))
  }

  const supprimerDuPanier = (productId) => {
    setPanier(prev => prev.filter(item => item.product_id !== productId))
  }

  const round = (num) => Math.round(num * 100) / 100

  const calculerTotaux = () => {
    const subtotal = panier.reduce((sum, item) => sum + item.unit_price_ht * item.quantity, 0)

    let montantRemise = 0
    if (remiseType === 'percent') {
      montantRemise = subtotal * (remiseValeur / 100)
    } else {
      montantRemise = Math.min(remiseValeur, subtotal)
    }

    const totalHt = subtotal - montantRemise
    const totalTva = totalHt * 0.20
    const totalTtc = totalHt + totalTva

    return {
      subtotal: round(subtotal),
      montantRemise: round(montantRemise),
      totalHt: round(totalHt),
      totalTva: round(totalTva),
      totalTtc: round(totalTtc)
    }
  }

  const totaux = calculerTotaux()

  const handleValidate = async () => {
    if (panier.length === 0) {
      toast.error('Ajoutez au moins un produit au panier')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifie')

      const items = panier.map((item, i) => ({
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price_ht: item.unit_price_ht,
        cost_price_ht: item.cost_price_ht,
        tax_rate: item.tax_rate,
        total_ht: round(item.unit_price_ht * item.quantity),
        position: i + 1
      }))

      // 1. Creer commande type quick_sale, statut termine
      const order = await createOrder(workspace.id, user.id, selectedClient?.id || null, items, {
        order_type: 'quick_sale',
        status: 'termine',
        source: 'direct',
        subtotal_ht: totaux.totalHt,
        total_tva: totaux.totalTva,
        total_ttc: totaux.totalTtc,
        discount_global: totaux.montantRemise,
        discount_type: remiseType
      })

      // 2. Creer paiement total
      await createPayment(workspace.id, order.id, user.id, {
        payment_type: 'full',
        payment_method: paymentMethod,
        amount: totaux.totalTtc,
        notes: 'Vente rapide'
      })

      // 3. Debiter le stock
      if (defaultLocationId) {
        try {
          await debitStock(workspace.id, order.id, items, defaultLocationId, user.id)
        } catch (stockErr) {
          console.warn('Debit stock non effectue:', stockErr.message)
        }
      }

      // 4. Generer facture simplifiee
      try {
        await generateInvoiceFromOrder(order.id, 'quick_sale')
      } catch (invoiceErr) {
        console.warn('Facture simplifiee non generee:', invoiceErr.message)
      }

      setLastOrder({ ...order, total_ttc: totaux.totalTtc })
      setShowConfirmation(true)
      toast.success('Vente enregistree !')

      // Reset
      setPanier([])
      setRemiseValeur(0)
      setSelectedClient(null)
      setClientSearch('')
    } catch (err) {
      console.error('Erreur vente rapide:', err)
      toast.error(err.message || 'Erreur lors de la vente')
    } finally {
      setLoading(false)
    }
  }

  const PAYMENT_METHODS = [
    { value: 'cash', label: 'Especes', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    )},
    { value: 'card', label: 'CB', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    )},
    { value: 'check', label: 'Cheque', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
    { value: 'transfer', label: 'Virement', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    )}
  ]

  // Ecran de confirmation
  if (showConfirmation && lastOrder) {
    return (
      <div className="p-4 md:p-8 min-h-screen flex items-center justify-center">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-[#040741] mb-2">Vente enregistree !</h2>
          <p className="text-gray-500 mb-2">Commande {lastOrder.order_number}</p>
          <p className="text-3xl font-bold text-[#313ADF] mb-8">{lastOrder.total_ttc?.toFixed(2)} EUR TTC</p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowConfirmation(false)
                setLastOrder(null)
              }}
              className="flex-1 bg-[#313ADF] text-white py-3 rounded-xl font-bold hover:bg-[#4149e8] transition-colors"
            >
              Nouvelle vente
            </button>
            <button
              onClick={() => navigate(`/commandes/${lastOrder.id}`)}
              className="flex-1 bg-gray-100 text-[#040741] py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors"
            >
              Voir la commande
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">Vente rapide</h1>
        <p className="text-gray-500">Encaissement rapide en caisse</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne gauche : Recherche produits */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recherche */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
            <div className="relative">
              <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un produit (nom ou reference)..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                autoFocus
              />
            </div>
          </div>

          {/* Grille produits */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
            {produitsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#313ADF] border-t-transparent"></div>
              </div>
            ) : filteredProduits.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p>{searchTerm ? 'Aucun produit trouve' : 'Aucun produit disponible'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto">
                {filteredProduits.map(produit => (
                  <button
                    key={produit.id}
                    onClick={() => ajouterAuPanier(produit)}
                    className="bg-gray-50 hover:bg-[#313ADF]/5 border border-gray-200 hover:border-[#313ADF]/30 rounded-xl p-3 text-left transition-all group"
                  >
                    <p className="font-semibold text-[#040741] text-sm truncate group-hover:text-[#313ADF]">
                      {produit.name}
                    </p>
                    {produit.reference && (
                      <p className="text-xs text-gray-400 truncate">{produit.reference}</p>
                    )}
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[#313ADF] font-bold">
                        {(produit.unit_price_ht || 0).toFixed(2)} EUR HT
                      </p>
                      {stockMap[produit.id] !== undefined && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          stockMap[produit.id] <= 0 ? 'bg-red-100 text-red-600' :
                          stockMap[produit.id] < 3 ? 'bg-orange-100 text-orange-600' :
                          'bg-green-100 text-green-600'
                        }`}>
                          {stockMap[produit.id]}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite : Panier + Paiement */}
        <div className="space-y-4">
          {/* Client optionnel */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
            <h3 className="text-sm font-semibold text-[#040741] mb-2">Client (optionnel)</h3>
            {selectedClient ? (
              <div className="flex items-center justify-between bg-[#313ADF]/5 rounded-xl p-3">
                <div>
                  <p className="font-medium text-[#040741] text-sm">{selectedClient.first_name} {selectedClient.last_name}</p>
                  <p className="text-xs text-gray-500">{selectedClient.phone}</p>
                </div>
                <button
                  onClick={() => { setSelectedClient(null); setClientSearch('') }}
                  className="p-1 hover:bg-gray-200 rounded-lg"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value)
                    searchClients(e.target.value)
                  }}
                  onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                  placeholder="Rechercher par nom ou telephone..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
                {showClientSuggestions && clientSuggestions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-auto">
                    {clientSuggestions.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => {
                          setSelectedClient(c)
                          setClientSearch('')
                          setShowClientSuggestions(false)
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-[#313ADF]/5 text-sm"
                      >
                        <span className="font-medium text-[#040741]">{c.first_name} {c.last_name}</span>
                        <span className="text-gray-400 ml-2">{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Panier */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
            <h3 className="text-sm font-semibold text-[#040741] mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              Panier ({panier.length})
            </h3>

            {panier.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Panier vide</p>
            ) : (
              <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                {panier.map(item => (
                  <div key={item.product_id} className="flex items-center justify-between bg-gray-50 rounded-xl p-2.5">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="font-medium text-[#040741] text-sm truncate">{item.description}</p>
                      <p className="text-xs text-gray-400">{item.unit_price_ht.toFixed(2)} EUR x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => modifierQuantite(item.product_id, -1)}
                        className="w-7 h-7 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-semibold text-sm text-[#040741]">{item.quantity}</span>
                      <button
                        onClick={() => modifierQuantite(item.product_id, 1)}
                        className="w-7 h-7 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
                      >
                        +
                      </button>
                      <button
                        onClick={() => supprimerDuPanier(item.product_id)}
                        className="w-7 h-7 ml-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <p className="font-bold text-[#313ADF] text-sm ml-2 w-20 text-right">
                      {(item.unit_price_ht * item.quantity).toFixed(2)} EUR
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Remise */}
            {panier.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">Remise</span>
                  <div className="flex items-center gap-1 flex-1">
                    <button
                      onClick={() => setRemiseType(remiseType === 'percent' ? 'euro' : 'percent')}
                      className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-lg font-medium hover:bg-gray-300"
                    >
                      {remiseType === 'percent' ? '%' : 'EUR'}
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={remiseType === 'percent' ? 100 : totaux.subtotal}
                      value={remiseValeur || ''}
                      onChange={(e) => setRemiseValeur(parseFloat(e.target.value) || 0)}
                      className="w-16 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-center text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#313ADF]/30"
                      placeholder="0"
                    />
                  </div>
                  {totaux.montantRemise > 0 && (
                    <span className="text-xs text-green-600 font-medium">-{totaux.montantRemise.toFixed(2)} EUR</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Methode de paiement */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4">
            <h3 className="text-sm font-semibold text-[#040741] mb-3">Methode de paiement</h3>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setPaymentMethod(m.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    paymentMethod === m.value
                      ? 'bg-[#313ADF] text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Total + Validation */}
          <div className="bg-gradient-to-br from-[#040741] to-[#0a0b52] rounded-2xl p-5 text-white">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-white/60 text-sm">
                <span>Sous-total HT</span>
                <span>{totaux.subtotal.toFixed(2)} EUR</span>
              </div>
              {totaux.montantRemise > 0 && (
                <div className="flex justify-between text-green-400 text-sm">
                  <span>Remise</span>
                  <span>-{totaux.montantRemise.toFixed(2)} EUR</span>
                </div>
              )}
              <div className="flex justify-between text-white/60 text-sm">
                <span>TVA (20%)</span>
                <span>{totaux.totalTva.toFixed(2)} EUR</span>
              </div>
              <div className="border-t border-white/20 pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">Total TTC</span>
                  <span className="text-2xl font-bold">{totaux.totalTtc.toFixed(2)} EUR</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleValidate}
              disabled={loading || panier.length === 0}
              className="w-full bg-[#313ADF] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#4149e8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Encaissement...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Encaisser {totaux.totalTtc.toFixed(2)} EUR
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Loader plein ecran */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-[#313ADF] mx-auto"></div>
            <p className="mt-4 text-[#040741] font-medium">Encaissement en cours...</p>
          </div>
        </div>
      )}
    </div>
  )
}
