import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { creerDevis, creerLivraison } from '../lib/api'
import PhoneInput from '../components/ui/PhoneInput'
import ToggleButton from '../components/ui/ToggleButton'

const produitsDemo = [
  { id: '1', nom: 'Matelas mousse haute densité', prix_unitaire: 483.99 },
  { id: '2', nom: 'Oreiller mémoire de forme', prix_unitaire: 45.00 },
  { id: '3', nom: 'Sommier Tapissier 160x200', prix_unitaire: 299.00 },
  { id: '4', nom: 'Couette 4 Saisons', prix_unitaire: 129.00 },
  { id: '5', nom: 'Protège-Matelas', prix_unitaire: 39.00 },
  { id: '6', nom: 'Matelas ressorts ensachés', prix_unitaire: 699.00 },
  { id: '7', nom: 'Lit coffre 160x200', prix_unitaire: 549.00 },
  { id: '8', nom: 'Tête de lit capitonnée', prix_unitaire: 199.00 }
]

export default function CreerDevis() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Client state
  const [client, setClient] = useState({
    nom: '', prenom: '', telephone: '', email: '', adresse: ''
  })
  const [clientSuggestions, setClientSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Products state - BUG #4 FIX: Default quantity = 1
  const [lignes, setLignes] = useState([
    { id: 1, produit_id: null, nom_produit: '', quantite: 1, prix_unitaire: 0, total: 0 },
    { id: 2, produit_id: null, nom_produit: '', quantite: 1, prix_unitaire: 0, total: 0 }
  ])

  // BUG #6 FIX: Remise type toggle (% or €)
  const [remiseType, setRemiseType] = useState('percent') // 'percent' or 'euro'
  const [remiseValeur, setRemiseValeur] = useState(0)
  const [avecLivraison, setAvecLivraison] = useState(true)
  const [notes, setNotes] = useState('')
  const [produits, setProduits] = useState(produitsDemo)

  useEffect(() => {
    loadProduits()
  }, [])

  const loadProduits = async () => {
    try {
      const { data } = await supabase.from('produits').select('*').eq('actif', true)
      if (data && data.length > 0) setProduits(data)
    } catch (err) {
      console.log('Utilisation des produits démo')
    }
  }

  const searchClients = async (telephone) => {
    if (telephone.length < 3) {
      setClientSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const { data } = await supabase.from('clients').select('*').ilike('telephone', `%${telephone}%`).limit(5)
      if (data && data.length > 0) {
        setClientSuggestions(data)
        setShowSuggestions(true)
      } else {
        setClientSuggestions([])
        setShowSuggestions(false)
      }
    } catch (err) {
      console.log('Erreur recherche clients')
    }
  }

  const selectClient = (selectedClient) => {
    setClient({
      nom: selectedClient.nom,
      prenom: selectedClient.prenom,
      telephone: selectedClient.telephone,
      email: selectedClient.email || '',
      adresse: selectedClient.adresse
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
        nom_produit: produitSelected.nom,
        prix_unitaire: produitSelected.prix_unitaire,
        total: produitSelected.prix_unitaire * l.quantite
      } : l
    ))
  }

  const handleQuantiteChange = (ligneId, newQuantite) => {
    const qty = Math.max(1, parseInt(newQuantite) || 1)
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, quantite: qty, total: l.prix_unitaire * qty } : l
    ))
  }

  const ajouterLigne = () => {
    const newId = Math.max(...lignes.map(l => l.id)) + 1
    // BUG #4 FIX: Default quantity = 1
    setLignes([...lignes, { id: newId, produit_id: null, nom_produit: '', quantite: 1, prix_unitaire: 0, total: 0 }])
  }

  // BUG #5 FIX: Remove line function
  const supprimerLigne = (ligneId) => {
    if (lignes.length <= 1) return // Minimum 1 ligne
    setLignes(prev => prev.filter(l => l.id !== ligneId))
  }

  // Fonction utilitaire pour arrondir à 2 décimales
  const round = (num) => Math.round(num * 100) / 100

  // CORRECTION CALCULS FINANCIERS
  const calculerTotaux = () => {
    // 1. SOUS-TOTAL HT = Somme de toutes les lignes produits
    const subtotal = lignes.reduce((sum, l) => sum + (l.quantite * l.prix_unitaire), 0)

    // 2. CALCUL DE LA REMISE
    let montantRemise = 0
    if (remiseType === 'percent') {
      // Remise en pourcentage
      montantRemise = subtotal * (remiseValeur / 100)
    } else {
      // Remise en euros (montant fixe) - ne peut pas dépasser le sous-total
      montantRemise = Math.min(remiseValeur, subtotal)
    }

    // 3. TOTAL HT APRÈS REMISE
    const total_ht = subtotal - montantRemise

    // 4. TVA (20% du total HT après remise)
    const montant_tva = total_ht * 0.20

    // 5. TOTAL TTC
    const total_ttc = total_ht + montant_tva

    // 6. ARRONDIR TOUS LES MONTANTS À 2 DÉCIMALES
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
    const lignesValides = lignes.filter(l => l.produit_id !== null)
    if (lignesValides.length === 0) {
      setError('Veuillez sélectionner au moins un produit')
      return
    }

    setLoading(true)
    try {
      const data = {
        client: { nom: client.nom, prenom: client.prenom, telephone: client.telephone, email: client.email || null, adresse: client.adresse },
        lignes: lignesValides.map(l => ({ produit_id: l.produit_id, nom_produit_libre: null, quantite: l.quantite, prix_unitaire: l.prix_unitaire })),
        remise_globale: totaux.montantRemise,
        notes: notes || null
      }

      // === DIAGNOSTIC DEVIS ===
      console.log('=== DIAGNOSTIC DEVIS ===')
      console.log('Nombre de lignes produits:', lignesValides.length)
      console.log('Quantité totale:', lignesValides.reduce((sum, l) => sum + l.quantite, 0))
      console.log('Détail des lignes:', lignesValides.map(l => ({ id: l.produit_id, nom: l.nom_produit, qte: l.quantite, prix: l.prix_unitaire })))
      console.log('Payload complet:', JSON.stringify(data, null, 2))
      console.log('========================')

      const result = await creerDevis(data)

      console.log('=== RÉPONSE WEBHOOK ===')
      console.log('Résultat:', result)
      console.log('=======================')

      const devisId = result.devis_id || result.id

      if (!devisId) throw new Error('Aucun ID de devis retourné par le serveur')

      if (avecLivraison && devisId) {
        try { await creerLivraison({ devis_id: devisId }) } catch (e) { console.warn('Erreur livraison:', e) }
      }

      navigate(`/apercu-devis/${devisId}`)
    } catch (err) {
      // === LOG ERREUR DÉTAILLÉ ===
      console.error('❌ ERREUR CRÉATION DEVIS ===')
      console.error('Message:', err.message)
      console.error('Erreur complète:', err)
      console.error('Stack:', err.stack)
      console.error('============================')
      setError(err.message || 'Erreur lors de la création du devis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 min-h-screen max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#040741] mb-2">Nouveau devis</h1>
        <p className="text-gray-500">Créer un devis pour un client</p>
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

          {/* BUG #3 FIX: International phone input */}
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
                    <div className="font-medium text-[#040741]">{c.prenom} {c.nom}</div>
                    <div className="text-sm text-gray-500">{c.telephone} - {c.email}</div>
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
              {/* Sélecteur produit */}
              <div className="md:col-span-5 relative">
                <select
                  value={ligne.produit_id || ''}
                  onChange={(e) => handleProduitChange(ligne.id, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                >
                  <option value="">Sélectionner un produit</option>
                  {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Quantité - BUG #4 FIX: default = 1 */}
              <div className="md:col-span-2">
                <input
                  type="number"
                  min={1}
                  value={ligne.quantite}
                  onChange={(e) => handleQuantiteChange(ligne.id, e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3 py-3 text-center font-semibold text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>

              {/* Prix unitaire */}
              <div className="md:col-span-2">
                <div className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-center text-gray-600">
                  {ligne.prix_unitaire.toFixed(2)} €
                </div>
              </div>

              {/* Total ligne */}
              <div className="md:col-span-2">
                <div className="bg-[#313ADF]/10 border border-[#313ADF]/20 rounded-xl px-3 py-3 text-center font-bold text-[#313ADF]">
                  {ligne.total.toFixed(2)} €
                </div>
              </div>

              {/* BUG #5 FIX: Bouton supprimer */}
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

        {/* Bouton ajouter ligne */}
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

          {/* BUG #6 FIX: Remise avec toggle % / € */}
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

          {/* Bouton Générer */}
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
                Générer le devis
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bouton Retour */}
      <button
        onClick={() => navigate('/devis')}
        className="inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour à la liste
      </button>
    </div>
  )
}
