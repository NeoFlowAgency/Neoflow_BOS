import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { creerDevis, creerLivraison } from '../lib/api'

const produitsDemo = [
  { id: '1', nom: 'Matelas mousse haute densité', prix_unitaire: 483.99 },
  { id: '2', nom: 'Oreiller mémoire de forme', prix_unitaire: 45.00 },
  { id: '3', nom: 'Sommier Tapissier 160x200', prix_unitaire: 299.00 },
  { id: '4', nom: 'Couette 4 Saisons', prix_unitaire: 129.00 },
  { id: '5', nom: 'Protège-Matelas', prix_unitaire: 39.00 }
]

export default function CreerDevis() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [client, setClient] = useState({
    nom: '', prenom: '', telephone: '', email: '', adresse: ''
  })
  const [clientSuggestions, setClientSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [lignes, setLignes] = useState([
    { id: 1, produit_id: null, nom_produit: '', quantite: 2, prix_unitaire: 0, total: 0 },
    { id: 2, produit_id: null, nom_produit: '', quantite: 2, prix_unitaire: 0, total: 0 }
  ])

  const [remiseValeur, setRemiseValeur] = useState(0)
  const [avecLivraison, setAvecLivraison] = useState(true)
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
    setLignes([...lignes, { id: newId, produit_id: null, nom_produit: '', quantite: 1, prix_unitaire: 0, total: 0 }])
  }

  const calculerTotaux = () => {
    const subtotal = lignes.reduce((sum, l) => sum + l.total, 0)
    const montantRemise = subtotal * (remiseValeur / 100)
    const total_ht = subtotal - montantRemise
    const montant_tva = total_ht * 0.20
    const total_ttc = total_ht + montant_tva
    return { subtotal, montantRemise, total_ht, montant_tva, total_ttc }
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
        notes: null
      }

      const result = await creerDevis(data)
      const devisId = result.devis_id || result.id

      if (!devisId) throw new Error('Aucun ID de devis retourné par le serveur')

      if (avecLivraison && devisId) {
        try { await creerLivraison({ devis_id: devisId }) } catch (e) { console.warn('Erreur livraison:', e) }
      }

      navigate(`/apercu-devis/${devisId}`)
    } catch (err) {
      setError(err.message || 'Erreur lors de la création du devis')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 min-h-screen overflow-y-auto">
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Section Information Client */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-[#3b82f6] italic mb-6">Information Client</h1>

        <div className="space-y-4 max-w-xl">
          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Nom et prenoms client</label>
            <input
              type="text"
              value={`${client.prenom} ${client.nom}`.trim()}
              onChange={(e) => {
                const parts = e.target.value.split(' ')
                setClient({ ...client, prenom: parts[0] || '', nom: parts.slice(1).join(' ') || '' })
              }}
              placeholder="sophie martin"
              className="w-full bg-[#c7d2fe] rounded-full px-5 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            />
          </div>

          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Téléphone</label>
            <div className="flex gap-2 relative">
              <span className="bg-[#c7d2fe] rounded-full px-4 py-3 text-gray-700 font-medium">+33</span>
              <input
                type="tel"
                value={client.telephone}
                onChange={(e) => { setClient({ ...client, telephone: e.target.value }); searchClients(e.target.value) }}
                placeholder="06 49 49 30 57"
                className="flex-1 bg-[#c7d2fe] rounded-full px-5 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
              />
              {showSuggestions && clientSuggestions.length > 0 && (
                <div className="absolute z-50 left-16 right-0 top-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-48 overflow-auto">
                  {clientSuggestions.map((c) => (
                    <button key={c.id} type="button" onClick={() => selectClient(c)} className="w-full px-4 py-2 text-left hover:bg-[#c7d2fe]/50 border-b last:border-b-0">
                      <div className="font-medium">{c.prenom} {c.nom}</div>
                      <div className="text-sm text-gray-500">{c.telephone}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Email</label>
            <input
              type="email"
              value={client.email}
              onChange={(e) => setClient({ ...client, email: e.target.value })}
              placeholder="sophiemartin@gmail.com"
              className="w-full bg-[#c7d2fe] rounded-full px-5 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            />
          </div>

          <div>
            <label className="block text-lg font-semibold text-gray-900 mb-2">Adresse</label>
            <input
              type="text"
              value={client.adresse}
              onChange={(e) => setClient({ ...client, adresse: e.target.value })}
              placeholder="15 rue des luciole haute goulaine"
              className="w-full bg-[#c7d2fe] rounded-full px-5 py-3 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
            />
          </div>
        </div>
      </div>

      {/* Section Information Commande */}
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-[#3b82f6] italic mb-6">Information Commande</h1>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Produit commandé</h2>

          <div className="flex items-center gap-4 mb-2 text-sm text-gray-500">
            <div className="flex-[3]">Nom du produit</div>
            <div className="w-20 text-center">Quantiter</div>
            <div className="w-24 text-center">Prix a l'unité</div>
            <div className="w-24 text-center">Prix Totale</div>
          </div>

          <div className="space-y-2">
            {lignes.map((ligne) => (
              <div key={ligne.id} className="flex items-center gap-4">
                <div className="flex-[3] relative">
                  <select
                    value={ligne.produit_id || ''}
                    onChange={(e) => handleProduitChange(ligne.id, e.target.value)}
                    className="w-full bg-[#c7d2fe] rounded-full px-5 py-3 text-gray-800 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#3b82f6]"
                  >
                    <option value="">Sélectionner un produit</option>
                    {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  value={ligne.quantite}
                  onChange={(e) => handleQuantiteChange(ligne.id, e.target.value)}
                  className="w-20 bg-white border-2 border-gray-200 rounded-xl px-3 py-2 text-center font-semibold focus:outline-none focus:border-[#3b82f6]"
                />
                <div className="w-24 bg-white border-2 border-gray-200 rounded-xl px-3 py-2 text-center text-gray-700">
                  {ligne.prix_unitaire.toFixed(2)} €
                </div>
                <div className="w-24 bg-white border-2 border-gray-200 rounded-xl px-3 py-2 text-center font-semibold">
                  {ligne.total.toFixed(0)} €
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={ajouterLigne} className="mt-3 w-10 h-10 bg-gray-200 hover:bg-gray-300 rounded-xl flex items-center justify-center text-2xl text-gray-600 transition-colors">
            +
          </button>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Remise globale</h2>
          <div className="inline-flex items-center bg-[#c7d2fe] rounded-full px-4 py-2">
            <span className="text-gray-700 mr-1">-</span>
            <input
              type="number"
              min={0}
              max={100}
              value={remiseValeur}
              onChange={(e) => setRemiseValeur(parseFloat(e.target.value) || 0)}
              className="w-12 bg-transparent text-center font-medium focus:outline-none"
            />
            <span className="text-gray-700">%</span>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Livraison</h2>
          <div className="flex gap-3">
            <button type="button" onClick={() => setAvecLivraison(true)} className={`px-8 py-2 rounded-full font-semibold transition-colors ${avecLivraison ? 'bg-[#4ade80] text-white' : 'bg-gray-200 text-gray-600'}`}>
              Oui
            </button>
            <button type="button" onClick={() => setAvecLivraison(false)} className={`px-8 py-2 rounded-full font-semibold transition-colors ${!avecLivraison ? 'bg-[#f87171] text-white' : 'bg-gray-200 text-gray-600'}`}>
              Non
            </button>
          </div>
        </div>

        {/* Récapitulatif */}
        <div className="bg-gray-50 rounded-2xl p-6 max-w-sm mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Récapitulatif</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Sous-total HT :</span><span>{totaux.subtotal.toFixed(2)} €</span></div>
            {totaux.montantRemise > 0 && <div className="flex justify-between text-green-600"><span>Remise ({remiseValeur}%) :</span><span>- {totaux.montantRemise.toFixed(2)} €</span></div>}
            <div className="flex justify-between"><span className="text-gray-600">Total HT :</span><span>{totaux.total_ht.toFixed(2)} €</span></div>
            <div className="flex justify-between"><span className="text-gray-600">TVA (20%) :</span><span>{totaux.montant_tva.toFixed(2)} €</span></div>
            <div className="border-t border-dashed border-gray-300 my-2"></div>
            <div className="flex justify-between text-lg font-bold"><span className="text-[#1e1b4b]">TOTAL TTC :</span><span className="text-[#3b82f6]">{totaux.total_ttc.toFixed(2)} €</span></div>
          </div>
        </div>

        <button onClick={handleSubmit} disabled={loading} className="bg-[#1e1b4b] text-white px-12 py-3 rounded-full font-semibold text-lg hover:bg-[#2d2a5d] transition-colors disabled:opacity-50">
          {loading ? 'Création...' : 'Suivant'}
        </button>
      </div>

      {/* Lien Retour */}
      <button onClick={() => navigate('/devis')} className="inline-flex items-center gap-2 px-6 py-2 border-2 border-[#1e1b4b] rounded-full text-[#1e1b4b] font-semibold hover:bg-gray-50 transition-colors">
        <span>←</span>
        <span>Retour</span>
      </button>
    </div>
  )
}
