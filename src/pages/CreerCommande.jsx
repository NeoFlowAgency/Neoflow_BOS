import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createOrder } from '../services/orderService'
import { getStockLevels } from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import PhoneInput from '../components/ui/PhoneInput'
import ToggleButton from '../components/ui/ToggleButton'

export default function CreerCommande() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Client
  const [clientType, setClientType] = useState('particulier') // 'particulier' | 'pro'
  const [client, setClient] = useState({
    id: null, nom: '', prenom: '', telephone: '', email: '', adresse: '',
    company_name: '', siret: ''
  })
  const [clientSuggestions, setClientSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Produits
  const [lignes, setLignes] = useState([
    { id: 1, produit_id: null, product_name: '', quantity: 1, unit_price: 0, cost_price: null, tax_rate: 20, discount_item: 0, discount_item_type: 'percent' }
  ])
  const [produits, setProduits] = useState([])
  const [produitsLoading, setProduitsLoading] = useState(false)

  // Options
  const [remiseType, setRemiseType] = useState('percent')
  const [remiseValeur, setRemiseValeur] = useState(0)
  const [deliveryType, setDeliveryType] = useState('none') // none, delivery, pickup
  const [deliveryFees, setDeliveryFees] = useState(0)
  const [notes, setNotes] = useState('')

  // Stock
  const [stockMap, setStockMap] = useState({}) // productId -> totalAvailable

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
      const levelsData = await getStockLevels(workspace.id)
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

  const searchClients = async (telephone) => {
    if (telephone.length < 3 || !workspace?.id) {
      setClientSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('workspace_id', workspace.id)
        .ilike('phone', `%${telephone}%`)
        .limit(5)
      if (data && data.length > 0) {
        setClientSuggestions(data)
        setShowSuggestions(true)
      } else {
        setClientSuggestions([])
        setShowSuggestions(false)
      }
    } catch (err) {
      console.error('Erreur recherche clients:', err)
    }
  }

  const selectClient = (c) => {
    setClient({
      id: c.id,
      nom: c.last_name,
      prenom: c.first_name,
      telephone: c.phone,
      email: c.email || '',
      adresse: c.address || '',
      company_name: c.company_name || '',
      siret: c.siret || ''
    })
    if (c.customer_type === 'pro') setClientType('pro')
    else setClientType('particulier')
    setShowSuggestions(false)
  }

  const handleProduitChange = (ligneId, produitId) => {
    const produit = produits.find(p => p.id === produitId)
    if (!produit) return
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? {
        ...l,
        produit_id: produit.id,
        product_name: produit.name,
        unit_price: produit.unit_price_ht || 0,
        cost_price: produit.cost_price_ht || null,
        tax_rate: produit.tax_rate || 20,
      } : l
    ))
  }

  const handleQuantiteChange = (ligneId, newQty) => {
    const qty = Math.max(1, parseInt(newQty) || 1)
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, quantity: qty } : l
    ))
  }

  const handlePriceChange = (ligneId, newPrice) => {
    const price = parseFloat(newPrice) || 0
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, unit_price: price } : l
    ))
  }

  const handleLineDiscount = (ligneId, field, value) => {
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, [field]: value } : l
    ))
  }

  const ajouterLigne = () => {
    const newId = Math.max(...lignes.map(l => l.id), 0) + 1
    setLignes([...lignes, { id: newId, produit_id: null, product_name: '', quantity: 1, unit_price: 0, cost_price: null, tax_rate: 20, discount_item: 0, discount_item_type: 'percent' }])
  }

  const supprimerLigne = (ligneId) => {
    if (lignes.length <= 1) return
    setLignes(prev => prev.filter(l => l.id !== ligneId))
  }

  const round = (num) => Math.round(num * 100) / 100

  const lineTotal = (l) => {
    const gross = l.unit_price * l.quantity
    const disc = l.discount_item_type === 'percent'
      ? gross * ((l.discount_item || 0) / 100)
      : Math.min(l.discount_item || 0, gross)
    return round(gross - disc)
  }

  const calculerTotaux = () => {
    const subtotalBrut = lignes.reduce((sum, l) => sum + l.unit_price * l.quantity, 0)
    const subtotalApresLigne = lignes.reduce((sum, l) => sum + lineTotal(l), 0)
    const remiseLigne = subtotalBrut - subtotalApresLigne

    let montantRemise = 0
    if (remiseType === 'percent') {
      montantRemise = subtotalApresLigne * (remiseValeur / 100)
    } else {
      montantRemise = Math.min(remiseValeur, subtotalApresLigne)
    }

    const totalHt = subtotalApresLigne - montantRemise
    const totalTva = totalHt * 0.20
    const totalTtcAvantFrais = totalHt + totalTva
    const totalTtc = totalTtcAvantFrais + (deliveryType === 'delivery' ? (deliveryFees || 0) : 0)

    return {
      subtotal: round(subtotalBrut),
      remiseLigne: round(remiseLigne),
      montantRemise: round(montantRemise),
      totalHt: round(totalHt),
      totalTva: round(totalTva),
      fraisLivraison: deliveryType === 'delivery' ? round(deliveryFees || 0) : 0,
      totalTtc: round(totalTtc)
    }
  }

  const totaux = calculerTotaux()

  const handleSubmit = async () => {
    setError('')

    const lignesValides = lignes.filter(l => l.produit_id !== null)
    if (lignesValides.length === 0) {
      setError('Veuillez selectionner au moins un produit')
      return
    }

    if (deliveryType === 'delivery' && (!client.nom || !client.prenom || !client.telephone || !client.adresse)) {
      setError('Les informations client completes sont requises pour une livraison')
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

      // Creer ou trouver le client si renseigne
      let clientId = client.id
      if (client.telephone && client.nom) {
        if (!clientId) {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('workspace_id', workspace.id)
            .eq('phone', client.telephone)
            .limit(1)
            .single()

          if (existing?.id) {
            await supabase
              .from('customers')
              .update({
                first_name: client.prenom,
                last_name: client.nom,
                email: client.email || null,
                address: client.adresse || null
              })
              .eq('id', existing.id)
            clientId = existing.id
          } else {
            const { data: newCustomer, error: custError } = await supabase
              .from('customers')
              .insert({
                workspace_id: workspace.id,
                first_name: client.prenom,
                last_name: client.nom,
                phone: client.telephone,
                email: client.email || null,
                address: client.adresse || null,
                customer_type: clientType,
                company_name: clientType === 'pro' ? (client.company_name || null) : null,
                siret: clientType === 'pro' ? (client.siret || null) : null,
              })
              .select('id')
              .single()
            if (custError) throw new Error('Erreur creation client: ' + custError.message)
            clientId = newCustomer.id
          }
        }
      }

      const items = lignesValides.map((l, i) => ({
        product_id: l.produit_id,
        description: l.product_name,
        quantity: l.quantity,
        unit_price_ht: l.unit_price,
        cost_price_ht: l.cost_price,
        tax_rate: l.tax_rate,
        discount_item: l.discount_item || 0,
        discount_item_type: l.discount_item_type || 'percent',
        total_ht: lineTotal(l),
        position: i + 1
      }))

      const order = await createOrder(workspace.id, user.id, clientId || null, items, {
        order_type: 'standard',
        status: 'confirme',
        source: 'direct',
        subtotal_ht: totaux.totalHt,
        total_tva: totaux.totalTva,
        total_ttc: totaux.totalTtc,
        discount_global: totaux.montantRemise,
        discount_type: remiseType,
        requires_delivery: deliveryType !== 'none',
        delivery_type: deliveryType,
        delivery_fees: totaux.fraisLivraison,
        notes
      })

      toast.success('Commande creee avec succes !')
      navigate(`/commandes/${order.id}`)
    } catch (err) {
      console.error('Erreur creation commande:', err)
      setError(err.message || 'Erreur lors de la creation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-2">Nouvelle commande</h1>
        <p className="text-gray-500">Creer une commande pour un client</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Section Client */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 mb-6 overflow-visible">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#040741] flex items-center gap-2">
            <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Information Client
            {deliveryType === 'none' && <span className="text-sm font-normal text-gray-400 ml-2">(optionnel)</span>}
          </h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setClientType('particulier')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${clientType === 'particulier' ? 'bg-white text-[#313ADF] shadow-sm' : 'text-gray-500 hover:text-[#040741]'}`}
            >
              Particulier
            </button>
            <button
              type="button"
              onClick={() => setClientType('pro')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${clientType === 'pro' ? 'bg-white text-[#313ADF] shadow-sm' : 'text-gray-500 hover:text-[#040741]'}`}
            >
              Professionnel
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Prenom {deliveryType === 'delivery' && <span className="text-red-500">*</span>}</label>
            <input
              type="text"
              value={client.prenom}
              onChange={(e) => setClient({ ...client, prenom: e.target.value })}
              placeholder="Jean"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Nom {deliveryType === 'delivery' && <span className="text-red-500">*</span>}</label>
            <input
              type="text"
              value={client.nom}
              onChange={(e) => setClient({ ...client, nom: e.target.value })}
              placeholder="Dupont"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>
          <div className="relative">
            <label className="block text-sm font-semibold text-[#040741] mb-2">Telephone {deliveryType === 'delivery' && <span className="text-red-500">*</span>}</label>
            <PhoneInput
              value={client.telephone}
              onChange={(value) => setClient({ ...client, telephone: value })}
              onSearch={searchClients}
              placeholder="06 12 34 56 78"
            />
            {showSuggestions && clientSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-auto">
                <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50">Clients existants</p>
                {clientSuggestions.map(c => (
                  <button key={c.id} type="button" onClick={() => selectClient(c)} className="w-full px-4 py-3 text-left hover:bg-[#313ADF]/5 border-b last:border-b-0 transition-colors">
                    <div className="font-medium text-[#040741]">{c.first_name} {c.last_name}</div>
                    <div className="text-sm text-gray-500">{c.phone} - {c.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Email</label>
            <input
              type="email"
              value={client.email}
              onChange={(e) => setClient({ ...client, email: e.target.value })}
              placeholder="jean.dupont@email.com"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>
          {clientType === 'pro' && (
            <>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Nom de l'entreprise</label>
                <input
                  type="text"
                  value={client.company_name}
                  onChange={(e) => setClient({ ...client, company_name: e.target.value })}
                  placeholder="SARL Dupont"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">SIRET</label>
                <input
                  type="text"
                  value={client.siret}
                  onChange={(e) => setClient({ ...client, siret: e.target.value })}
                  placeholder="123 456 789 00012"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-[#040741] mb-2">Adresse {deliveryType === 'delivery' && <span className="text-red-500">*</span>}</label>
            <input
              type="text"
              value={client.adresse}
              onChange={(e) => setClient({ ...client, adresse: e.target.value })}
              placeholder="15 rue des Lilas, 75001 Paris"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>
        </div>
      </div>

      {/* Section Produits */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-[#040741] mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          Produits commandes
        </h2>

        {/* En-tetes */}
        <div className="hidden md:grid grid-cols-12 gap-3 mb-3 px-2">
          <div className="col-span-4 text-sm font-medium text-gray-500">Produit</div>
          <div className="col-span-1 text-sm font-medium text-gray-500 text-center">Qté</div>
          <div className="col-span-2 text-sm font-medium text-gray-500 text-center">Prix HT</div>
          <div className="col-span-3 text-sm font-medium text-gray-500 text-center">Remise ligne</div>
          <div className="col-span-1 text-sm font-medium text-gray-500 text-center">Total HT</div>
          <div className="col-span-1"></div>
        </div>

        <div className="space-y-3">
          {lignes.map(ligne => (
            <div key={ligne.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-gray-50 rounded-xl p-3">
              <div className="md:col-span-4 relative">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Produit</span>
                <select
                  value={ligne.produit_id || ''}
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
                {ligne.produit_id && stockMap[ligne.produit_id] !== undefined && stockMap[ligne.produit_id] < ligne.quantity && (
                  <p className={`text-xs mt-1 font-medium ${stockMap[ligne.produit_id] <= 0 ? 'text-red-500' : 'text-orange-500'}`}>
                    {stockMap[ligne.produit_id] <= 0 ? 'Rupture de stock' : `Stock faible: ${stockMap[ligne.produit_id]} dispo.`}
                  </p>
                )}
              </div>

              <div className="md:col-span-1">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Qté</span>
                <input
                  type="number" min={1}
                  value={ligne.quantity}
                  onChange={(e) => handleQuantiteChange(ligne.id, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-2 py-3 text-center font-semibold text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>

              <div className="md:col-span-2">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Prix HT</span>
                <input
                  type="number" step="0.01" min={0}
                  value={ligne.unit_price || ''}
                  onChange={(e) => handlePriceChange(ligne.id, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-center text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-3">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Remise ligne</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleLineDiscount(ligne.id, 'discount_item_type', ligne.discount_item_type === 'percent' ? 'euro' : 'percent')}
                    className="bg-white border border-gray-200 text-gray-500 px-2 py-3 rounded-xl text-xs font-medium hover:bg-gray-100 flex-shrink-0"
                  >
                    {ligne.discount_item_type === 'percent' ? '%' : '€'}
                  </button>
                  <input
                    type="number" min={0} max={ligne.discount_item_type === 'percent' ? 100 : ligne.unit_price * ligne.quantity}
                    value={ligne.discount_item || ''}
                    onChange={e => handleLineDiscount(ligne.id, 'discount_item', parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-gray-200 rounded-xl px-2 py-3 text-center text-sm text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="md:col-span-1">
                <span className="md:hidden text-xs font-medium text-gray-500 mb-1 block">Total HT</span>
                <div className="bg-[#313ADF]/10 border border-[#313ADF]/20 rounded-xl px-2 py-3 text-center font-bold text-[#313ADF] text-sm">
                  {lineTotal(ligne).toFixed(2)}
                </div>
              </div>

              <div className="md:col-span-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => supprimerLigne(ligne.id)}
                  disabled={lignes.length <= 1}
                  className={`p-2 rounded-lg transition-colors ${lignes.length <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
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

      {/* Options et Recapitulatif */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Options */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
          <h2 className="text-xl font-bold text-[#040741] mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Options
          </h2>

          {/* Remise */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-[#040741] mb-3">Remise globale</label>
            <div className="flex items-center gap-4 flex-wrap">
              <ToggleButton
                options={[
                  { value: 'percent', label: '%' },
                  { value: 'euro', label: 'EUR' }
                ]}
                value={remiseType}
                onChange={setRemiseType}
              />
              <div className="flex items-center gap-2">
                <span className="text-gray-500">-</span>
                <input
                  type="number"
                  min={0}
                  max={remiseType === 'percent' ? 100 : totaux.subtotal}
                  value={remiseValeur || ''}
                  onChange={(e) => setRemiseValeur(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-center font-medium text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  placeholder="0"
                />
                <span className="text-gray-500 font-medium">{remiseType === 'percent' ? '%' : 'EUR'}</span>
              </div>
            </div>
            {totaux.montantRemise > 0 && (
              <p className="mt-2 text-sm text-green-600">Remise appliquee : -{totaux.montantRemise.toFixed(2)} EUR</p>
            )}
          </div>

          {/* Type livraison */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-[#040741] mb-3">Type de retrait / livraison</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { value: 'none', label: 'Sans', color: 'gray' },
                { value: 'delivery', label: 'Livraison', color: 'blue' },
                { value: 'pickup', label: 'Retrait en magasin', color: 'green' }
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDeliveryType(opt.value)}
                  className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                    deliveryType === opt.value
                      ? 'bg-[#313ADF] text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Frais de livraison */}
          {deliveryType === 'delivery' && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-[#040741] mb-2">Frais de livraison (€ TTC)</label>
              <input
                type="number" min={0} step="0.01"
                value={deliveryFees || ''}
                onChange={e => setDeliveryFees(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informations complementaires..."
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
              <span>Sous-total HT</span>
              <span>{totaux.subtotal.toFixed(2)} EUR</span>
            </div>
            {totaux.remiseLigne > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Remises lignes</span>
                <span>- {totaux.remiseLigne.toFixed(2)} EUR</span>
              </div>
            )}
            {totaux.montantRemise > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Remise globale</span>
                <span>- {totaux.montantRemise.toFixed(2)} EUR</span>
              </div>
            )}
            <div className="flex justify-between text-white/70">
              <span>Total HT</span>
              <span>{totaux.totalHt.toFixed(2)} EUR</span>
            </div>
            <div className="flex justify-between text-white/70">
              <span>TVA (20%)</span>
              <span>{totaux.totalTva.toFixed(2)} EUR</span>
            </div>
            {totaux.fraisLivraison > 0 && (
              <div className="flex justify-between text-white/70">
                <span>Frais de livraison</span>
                <span>+ {totaux.fraisLivraison.toFixed(2)} EUR</span>
              </div>
            )}
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
                Creer la commande
              </>
            )}
          </button>
        </div>
      </div>

      {/* Retour */}
      <button
        onClick={() => navigate('/commandes')}
        className="inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour a la liste
      </button>

      {/* Loader plein ecran */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-[#313ADF] mx-auto"></div>
            <p className="mt-4 text-[#040741] font-medium">Creation de la commande...</p>
          </div>
        </div>
      )}
    </div>
  )
}
