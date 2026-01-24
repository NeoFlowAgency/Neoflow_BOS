import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ApercuDevis() {
  const { devisId } = useParams()
  const navigate = useNavigate()
  const [devis, setDevis] = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDevis()
  }, [devisId])

  const loadDevis = async () => {
    try {
      const { data: devisData } = await supabase
        .from('devis')
        .select('*, clients(*)')
        .eq('id', devisId)
        .single()

      const { data: lignesData } = await supabase
        .from('devis_lignes')
        .select('*')
        .eq('devis_id', devisId)

      setDevis(devisData)
      setLignes(lignesData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#1e1b4b] border-t-transparent"></div>
      </div>
    )
  }

  if (!devis) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 mb-4">Devis non trouvé</p>
        <button
          onClick={() => navigate('/devis')}
          className="bg-[#1e1b4b] text-white px-6 py-2 rounded-full"
        >
          Retour
        </button>
      </div>
    )
  }

  const client = devis.clients

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div></div>
        <h1 className="text-4xl font-bold text-[#3b82f6] italic">Voici votre devis</h1>
      </div>

      {/* Aperçu de la facture */}
      <div className="flex justify-center">
        <div className="bg-white rounded-2xl border-2 border-[#1e1b4b] p-8 max-w-2xl w-full shadow-xl">
          {/* En-tête facture */}
          <div className="flex items-start justify-between mb-6">
            <img
              src="/logo-maison-literie.png"
              alt="Maison de la Literie"
              className="h-16 rounded-lg"
            />
            <div className="text-right">
              <h2 className="text-4xl font-bold text-[#1e1b4b]">FACTURE</h2>
              <p className="text-sm text-gray-600">FACTURE N°: {devis.numero_devis}</p>
              <p className="text-sm text-gray-600">DATE: {new Date(devis.created_at).toLocaleDateString('fr-FR')}</p>
              <p className="text-sm text-gray-600">ÉCHÉANCE: À RÉCEPTION</p>
            </div>
          </div>

          {/* Émetteur / Destinataire */}
          <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
            <div>
              <p className="font-bold text-[#d97706] mb-1">ÉMETTEUR:</p>
              <p>Maison de la Literie</p>
              <p className="text-[#3b82f6]">contact@maisondelaliterie.fr</p>
              <p>123 Rue du Commerce</p>
              <p>44000 Nantes</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-[#d97706] mb-1">DESTINATAIRE:</p>
              <p>{client?.prenom} {client?.nom}</p>
              <p className="text-[#3b82f6]">{client?.email || ''}</p>
              <p>{client?.adresse}</p>
              <p>{client?.telephone}</p>
            </div>
          </div>

          {/* Tableau des produits */}
          <table className="w-full mb-6 text-sm">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 font-bold">DESCRIPTION:</th>
                <th className="text-center py-2 font-bold">QUANTITÉ:</th>
                <th className="text-right py-2 font-bold">PRIX UNITAIRE HT:</th>
                <th className="text-right py-2 font-bold">TOTAL HT:</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-2">{ligne.nom_produit_libre || 'Produit'}</td>
                  <td className="py-2 text-center">{ligne.quantite}</td>
                  <td className="py-2 text-right">{ligne.prix_unitaire?.toFixed(2)}€</td>
                  <td className="py-2 text-right">{ligne.total_ligne?.toFixed(2)}€</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totaux */}
          <div className="flex justify-end mb-8">
            <div className="w-64 text-sm">
              <div className="flex justify-between py-1">
                <span className="font-bold">TOTAL HT:</span>
                <span>{devis.total_ht?.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-bold">TVA:</span>
                <span>{((devis.total_ttc || 0) - (devis.total_ht || 0)).toFixed(2)}€</span>
              </div>
              {devis.remise_globale > 0 && (
                <div className="flex justify-between py-1">
                  <span className="font-bold">REMISE:</span>
                  <span>-{devis.remise_globale?.toFixed(2)}€</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-t border-gray-300 mt-2 pt-2">
                <span className="font-bold">TOTAL TTC:</span>
                <span className="font-bold">{devis.total_ttc?.toFixed(2)}€</span>
              </div>
            </div>
          </div>

          {/* Pied de page */}
          <div className="grid grid-cols-2 gap-8 text-xs text-gray-500 border-t border-gray-200 pt-4">
            <div>
              <p className="font-bold text-gray-700 mb-1">RÈGLEMENT:</p>
              <p>Par virement bancaire:</p>
              <p>Banque: Crédit Agricole</p>
              <p>IBAN: FR76 1234 5678 9012</p>
              <p>BIC: AGRIFRPP</p>
            </div>
            <div>
              <p className="font-bold text-gray-700 mb-1">TERMES & CONDITIONS</p>
              <p>En cas de retard de paiement, et conformément au code de commerce, une indemnité calculée à trois fois le taux d'intérêt légal ainsi qu'un frais de recouvrement de 40 euros sont exigibles.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lien Retour */}
      <div className="flex justify-center mt-8">
        <button
          onClick={() => navigate('/devis')}
          className="inline-flex items-center gap-2 px-6 py-2 border-2 border-[#3b82f6] rounded-full text-[#3b82f6] font-semibold hover:bg-blue-50 transition-colors"
        >
          <span>←</span>
          <span>Retour</span>
        </button>
      </div>
    </div>
  )
}
