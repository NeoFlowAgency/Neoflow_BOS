import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { creerLivraison } from '../lib/api'
import { jobService } from '../services/jobService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import PhoneInput from '../components/ui/PhoneInput'
import ToggleButton from '../components/ui/ToggleButton'

const N8N_WEBHOOK = 'https://n8n.srv1137119.hstgr.cloud/webhook/create-invoice'

export default function CreerFacture() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Client state
  const [client, setClient] = useState({
    id: null, nom: '', prenom: '', telephone: '', email: '', adresse: ''
  })
  const [clientSuggestions, setClientSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Products state
  const [lignes, setLignes] = useState([
    { id: 1, produit_id: null, product_name: '', quantity: 1, unit_price: 0, total: 0 },
    { id: 2, produit_id: null, product_name: '', quantity: 1, unit_price: 0, total: 0 }
  ])

  // Discount & options
  const [remiseType, setRemiseType] = useState('percent')
  const [remiseValeur, setRemiseValeur] = useState(0)
  const [avecLivraison, setAvecLivraison] = useState(true)
  const [dateLivraison, setDateLivraison] = useState('')
  const [notes, setNotes] = useState('')
  const [produits, setProduits] = useState([])
  const [produitsLoading, setProduitsLoading] = useState(false)

  useEffect(() => {
    if (workspace?.id) loadProduits()
  }, [workspace?.id])

  const loadProduits = async () => {
    setProduitsLoading(true)
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspace?.id)
      if (error) throw error
      setProduits(data || [])
    } catch (err) {
      console.error('Erreur chargement produits:', err)
      setProduits([])
    } finally {
      setProduitsLoading(false)
    }
  }

  const searchClients = async (telephone) => {
    if (telephone.length < 3) {
      setClientSuggestions([])
      setShowSuggestions(false)
      return
    }
    if (!workspace?.id) return
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
      console.error('[CreerFacture] Erreur recherche clients:', err.message, err)
    }
  }

  const selectClient = (selectedClient) => {
    setClient({
      id: selectedClient.id,
      nom: selectedClient.last_name,
      prenom: selectedClient.first_name,
      telephone: selectedClient.phone,
      email: selectedClient.email || '',
      adresse: selectedClient.address
    })
    setShowSuggestions(false)
  }

  const handleProduitChange = (ligneId, produitId) => {
    const produitSelected = produits.find(p => p.id === produitId)
    if (!produitSelected) return
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? {
        ...l,
        produit_id: produitSelected.id,
        product_name: produitSelected.name,
        unit_price: produitSelected.unit_price_ht,
        total: produitSelected.unit_price_ht * l.quantity
      } : l
    ))
  }

  const handleQuantiteChange = (ligneId, newQuantite) => {
    const qty = Math.max(1, parseInt(newQuantite) || 1)
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, quantity: qty, total: l.unit_price * qty } : l
    ))
  }

  const ajouterLigne = () => {
    const newId = Math.max(...lignes.map(l => l.id)) + 1
    setLignes([...lignes, { id: newId, produit_id: null, product_name: '', quantity: 1, unit_price: 0, total: 0 }])
  }

  const supprimerLigne = (ligneId) => {
    if (lignes.length <= 1) return
    setLignes(prev => prev.filter(l => l.id !== ligneId))
  }

  const round = (num) => Math.round(num * 100) / 100

  const calculerTotaux = () => {
    const subtotal = lignes.reduce((sum, l) => sum + (l.quantity * l.unit_price), 0)

    let montantRemise = 0
    if (remiseType === 'percent') {
      montantRemise = subtotal * (remiseValeur / 100)
    } else {
      montantRemise = Math.min(remiseValeur, subtotal)
    }

    const total_ht = subtotal - montantRemise
    const montant_tva = total_ht * 0.20
    const total_ttc = total_ht + montant_tva

    return {
      subtotal: round(subtotal),
      montantRemise: round(montantRemise),
      total_ht: round(total_ht),
      montant_tva: round(montant_tva),
      total_ttc: round(total_ttc)
    }
  }

  const totaux = calculerTotaux()

  const handleSubmit = async () => {
    setError('')
    if (!client.nom || !client.prenom || !client.telephone || !client.adresse) {
      setError('Veuillez remplir tous les champs client obligatoires')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (client.email && !emailRegex.test(client.email)) {
      setError('Veuillez entrer une adresse email valide (ex: exemple@mail.com)')
      return
    }

    const phoneDigits = client.telephone.replace(/\D/g, '')
    if (phoneDigits.length < 8) {
      setError('Veuillez entrer un numéro de téléphone valide (minimum 8 chiffres)')
      return
    }

    if (avecLivraison && !dateLivraison) {
      setError('Veuillez sélectionner une date de livraison')
      return
    }

    const lignesValides = lignes.filter(l => l.produit_id !== null)
    if (lignesValides.length === 0) {
      setError('Veuillez sélectionner au moins un produit')
      return
    }

    if (!workspace?.id) {
      setError('Aucun workspace actif. Veuillez sélectionner un workspace.')
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Utilisateur non authentifié')

      const discountAmount = Number(totaux.montantRemise) || 0

      const invoicePayload = {
        customer: {
          id: client.id || null,
          last_name: client.nom,
          first_name: client.prenom,
          phone: client.telephone,
          email: client.email || null,
          address: client.adresse,
          default_delivery_address: client.adresse
        },
        invoice: {
          discount_global: discountAmount,
          discount_type: remiseType || 'percent',
          notes: notes || '',
          validity_days: 30,
          status: 'brouillon',
          has_delivery: avecLivraison || false,
          delivery_date: dateLivraison || null,
          subtotal_ht: totaux.total_ht,
          total_tva: totaux.montant_tva,
          total_ttc: totaux.total_ttc
        },
        items: lignesValides.map((l, index) => {
          const produit = produits.find(p => p.id === l.produit_id)
          return {
            product_id: l.produit_id,
            description: produit?.name || l.product_name || '',
            quantity: parseInt(l.quantity),
            unit_price_ht: l.unit_price,
            tax_rate: produit?.tax_rate ?? 20,
            total_ht: l.total,
            position: index + 1
          }
        })
      }

      // Step 1: Create job in Supabase (workspace_id guaranteed)
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          workspace_id: workspace.id,
          job_type: 'create_invoice',
          status: 'pending',
          payload: invoicePayload,
          created_by: user.id
        })
        .select()
        .single()

      if (jobError) throw new Error('Erreur création du job: ' + jobError.message)

      // Step 2: Notify n8n (fire-and-forget — don't block on failure)
      fetch(N8N_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          workspace_id: workspace.id,
          user_id: user.id,
          ...invoicePayload
        })
      }).catch(err => console.warn('[CreerFacture] n8n notification failed (non-blocking):', err.message))

      // Step 3: Poll job until n8n worker completes it
      const jobResult = await jobService.pollJobStatus(job.id, 30)

      if (jobResult.success) {
        const result = typeof jobResult.result === 'string'
          ? JSON.parse(jobResult.result)
          : jobResult.result || {}

        const factureId = result.invoice_id || result.id || job.id

        if (avecLivraison && factureId && factureId !== job.id) {
          try { await creerLivraison({ invoice_id: factureId, workspace_id: workspace.id }) } catch (e) { console.warn('Erreur livraison:', e) }
        }

        navigate(`/factures/${factureId}`)
      } else {
        // Job timed out or failed — navigate to invoice list
        console.warn('[CreerFacture] Job not completed yet:', jobResult.error)
        navigate('/factures')
      }
    } catch (err) {
      console.error('Erreur création facture:', err.message)
      if (err.message.includes('Failed to fetch')) {
        setError('Impossible de contacter le serveur. Vérifiez votre connexion.')
      } else {
        setError(err.message || 'Une erreur est survenue lors de la création de la facture.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 min-h-screen max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#040741] mb-2">Nouvelle facture</h1>
        <p className="text-gray-500">Créer une facture pour un client</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Section Information Client */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-[#040741] mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Information Client
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Prénom *</label>
            <input
              type="text"
              value={client.prenom}
              onChange={(e) => setClient({ ...client, prenom: e.target.value })}
              placeholder="Jean"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Nom *</label>
            <input
              type="text"
              value={client.nom}
              onChange={(e) => setClient({ ...client, nom: e.target.value })}
              placeholder="Dupont"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>

          <div className="relative">
            <label className="block text-sm font-semibold text-[#040741] mb-2">Téléphone *</label>
            <PhoneInput
              value={client.telephone}
              onChange={(value) => setClient({ ...client, telephone: value })}
              onSearch={searchClients}
              placeholder="06 12 34 56 78"
            />
            {showSuggestions && clientSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-auto">
                <p className="px-4 py-2 text-xs text-gray-500 bg-gray-50">Clients existants</p>
                {clientSuggestions.map((c) => (
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

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-[#040741] mb-2">Adresse *</label>
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
          Produits commandés
        </h2>

        {/* En-têtes colonnes */}
        <div className="hidden md:grid grid-cols-12 gap-4 mb-3 px-2">
          <div className="col-span-5 text-sm font-medium text-gray-500">Produit</div>
          <div className="col-span-2 text-sm font-medium text-gray-500 text-center">Quantité</div>
          <div className="col-span-2 text-sm font-medium text-gray-500 text-center">Prix unit. HT</div>
          <div className="col-span-2 text-sm font-medium text-gray-500 text-center">Total HT</div>
          <div className="col-span-1"></div>
        </div>

        {/* Lignes de produits */}
        <div className="space-y-3">
          {lignes.map((ligne) => (
            <div key={ligne.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-gray-50 rounded-xl p-3">
              <div className="md:col-span-5 relative">
                <select
                  value={ligne.produit_id || ''}
                  onChange={(e) => handleProduitChange(ligne.id, e.target.value)}
                  disabled={produitsLoading}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] disabled:opacity-50"
                >
                  {produitsLoading ? (
                    <option value="">Chargement des produits...</option>
                  ) : produits.length === 0 ? (
                    <option value="">Aucun produit disponible</option>
                  ) : (
                    <>
                      <option value="">Sélectionner un produit</option>
                      {produits.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </>
                  )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              <div className="md:col-span-2">
                <input
                  type="number"
                  min={1}
                  value={ligne.quantity}
                  onChange={(e) => handleQuantiteChange(ligne.id, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-center font-semibold text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>

              <div className="md:col-span-2">
                <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-600">
                  {ligne.unit_price.toFixed(2)} €
                </div>
              </div>

              <div className="md:col-span-2">
                <div className="bg-[#313ADF]/10 border border-[#313ADF]/20 rounded-xl px-3 py-3 text-center font-bold text-[#313ADF]">
                  {ligne.total.toFixed(2)} €
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
                  title={lignes.length <= 1 ? 'Minimum 1 ligne requise' : 'Supprimer la ligne'}
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

      {/* Section Options et Récapitulatif */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Options */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
          <h2 className="text-xl font-bold text-[#040741] mb-6 flex items-center gap-2">
            <svg className="w-6 h-6 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Options
          </h2>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-[#040741] mb-3">Remise globale</label>
            <div className="flex items-center gap-4 flex-wrap">
              <ToggleButton
                options={[
                  { value: 'percent', label: '%' },
                  { value: 'euro', label: '€' }
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
                  value={remiseValeur}
                  onChange={(e) => setRemiseValeur(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-center font-medium text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
                <span className="text-gray-500 font-medium">{remiseType === 'percent' ? '%' : '€'}</span>
              </div>
            </div>
            {remiseValeur > 0 && (
              <p className="mt-2 text-sm text-green-600">
                Remise appliquée : -{totaux.montantRemise.toFixed(2)} €
              </p>
            )}
          </div>

          {/* Livraison */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-[#040741] mb-3">Livraison incluse ?</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAvecLivraison(true)}
                className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                  avecLivraison
                    ? 'bg-green-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Oui
              </button>
              <button
                type="button"
                onClick={() => setAvecLivraison(false)}
                className={`px-6 py-2 rounded-xl font-semibold transition-all ${
                  !avecLivraison
                    ? 'bg-red-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Non
              </button>
            </div>

            {avecLivraison && (
              <div className="mt-4">
                <label className="block text-sm font-semibold text-[#040741] mb-2">
                  Date de livraison <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={dateLivraison}
                  onChange={(e) => setDateLivraison(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informations complémentaires..."
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
            />
          </div>
        </div>

        {/* Récapitulatif */}
        <div className="bg-gradient-to-br from-[#040741] to-[#0a0b52] rounded-2xl p-6 text-white">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Récapitulatif
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between text-white/70">
              <span>Sous-total HT</span>
              <span>{totaux.subtotal.toFixed(2)} €</span>
            </div>

            {totaux.montantRemise > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Remise ({remiseType === 'percent' ? `${remiseValeur}%` : `${remiseValeur}€`})</span>
                <span>- {totaux.montantRemise.toFixed(2)} €</span>
              </div>
            )}

            <div className="flex justify-between text-white/70">
              <span>Total HT</span>
              <span>{totaux.total_ht.toFixed(2)} €</span>
            </div>

            <div className="flex justify-between text-white/70">
              <span>TVA (20%)</span>
              <span>{totaux.montant_tva.toFixed(2)} €</span>
            </div>

            <div className="border-t border-white/20 pt-4 mt-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">Total TTC</span>
                <span className="text-3xl font-bold text-[#313ADF]">{totaux.total_ttc.toFixed(2)} €</span>
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
                Création en cours...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Générer la facture
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bouton Retour */}
      <button
        onClick={() => navigate('/factures')}
        className="inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour à la liste
      </button>

      {/* Loader plein écran pendant la création */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-[#313ADF] mx-auto"></div>
            <p className="mt-4 text-[#040741] font-medium">Création de la facture en cours...</p>
            <p className="mt-1 text-sm text-gray-500">Veuillez patienter</p>
          </div>
        </div>
      )}
    </div>
  )
}
