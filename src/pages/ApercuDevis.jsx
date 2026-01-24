import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { envoyerEmail, genererPdf, creerLivraison } from '../lib/api'

export default function ApercuDevis() {
  const { devisId } = useParams()
  const navigate = useNavigate()
  const [devis, setDevis] = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionMessage, setActionMessage] = useState({ type: '', text: '' })

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

  const handleSendEmail = async () => {
    if (!devis?.clients?.email) {
      setActionMessage({ type: 'error', text: 'Pas d\'email client disponible' })
      return
    }

    setActionLoading('email')
    setActionMessage({ type: '', text: '' })

    try {
      await envoyerEmail(devisId)
      setActionMessage({ type: 'success', text: 'Email envoyé avec succès !' })

      // Update status to "envoye"
      await supabase.from('devis').update({ statut: 'envoye' }).eq('id', devisId)
      loadDevis()
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Erreur lors de l\'envoi' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleDownloadPdf = async () => {
    setActionLoading('pdf')
    setActionMessage({ type: '', text: '' })

    try {
      const response = await genererPdf(devisId)

      if (response.pdf_url) {
        window.open(response.pdf_url, '_blank')
        setActionMessage({ type: 'success', text: 'PDF généré !' })
      } else {
        throw new Error('URL PDF non retournée')
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Erreur lors de la génération' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleCreateLivraison = async () => {
    setActionLoading('livraison')
    setActionMessage({ type: '', text: '' })

    try {
      await creerLivraison({ devis_id: devisId, adresse_livraison: devis?.clients?.adresse })
      setActionMessage({ type: 'success', text: 'Livraison créée !' })
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Erreur lors de la création' })
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  if (!devis) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-500 mb-4">Devis non trouvé</p>
        <button
          onClick={() => navigate('/devis')}
          className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold"
        >
          Retour aux devis
        </button>
      </div>
    )
  }

  const client = devis.clients

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#040741] mb-1">Aperçu du devis</h1>
          <p className="text-gray-500">N° {devis.numero_devis}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSendEmail}
            disabled={actionLoading === 'email'}
            className="flex items-center gap-2 px-4 py-2 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#040741] transition-colors disabled:opacity-50"
          >
            {actionLoading === 'email' ? (
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            Envoyer par email
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={actionLoading === 'pdf'}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#313ADF] text-[#313ADF] rounded-xl font-medium hover:bg-[#313ADF]/5 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'pdf' ? (
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            Télécharger PDF
          </button>

          <button
            onClick={handleCreateLivraison}
            disabled={actionLoading === 'livraison'}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {actionLoading === 'livraison' ? (
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            )}
            Créer livraison
          </button>
        </div>
      </div>

      {/* Message action */}
      {actionMessage.text && (
        <div className={`mb-6 px-4 py-3 rounded-xl flex items-center gap-2 ${
          actionMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-600' : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {actionMessage.type === 'success' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {actionMessage.text}
        </div>
      )}

      {/* Aperçu de la facture */}
      <div className="flex justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 max-w-3xl w-full">
          {/* En-tête facture */}
          <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-100">
            <div>
              <img
                src="/logo-neoflow.png"
                alt="Neoflow Agency"
                className="h-12 mb-2"
              />
              <p className="text-sm text-gray-500">Maison de la Literie</p>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-[#040741] mb-2">DEVIS</h2>
              <p className="text-sm text-gray-600">N°: {devis.numero_devis}</p>
              <p className="text-sm text-gray-600">Date: {new Date(devis.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
          </div>

          {/* Émetteur / Destinataire */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="font-bold text-[#313ADF] text-sm mb-2">ÉMETTEUR</p>
              <p className="font-medium text-[#040741]">Maison de la Literie</p>
              <p className="text-gray-600 text-sm">contact@maisondelaliterie.fr</p>
              <p className="text-gray-600 text-sm">123 Rue du Commerce</p>
              <p className="text-gray-600 text-sm">44000 Nantes</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-[#313ADF] text-sm mb-2">DESTINATAIRE</p>
              <p className="font-medium text-[#040741]">{client?.prenom} {client?.nom}</p>
              <p className="text-gray-600 text-sm">{client?.email || ''}</p>
              <p className="text-gray-600 text-sm">{client?.adresse}</p>
              <p className="text-gray-600 text-sm">{client?.telephone}</p>
            </div>
          </div>

          {/* Tableau des produits */}
          <div className="mb-8">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-[#040741]">
                  <th className="text-left py-3 font-bold text-[#040741]">Description</th>
                  <th className="text-center py-3 font-bold text-[#040741]">Qté</th>
                  <th className="text-right py-3 font-bold text-[#040741]">Prix unit. HT</th>
                  <th className="text-right py-3 font-bold text-[#040741]">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 text-[#040741]">{ligne.nom_produit_libre || 'Produit'}</td>
                    <td className="py-3 text-center text-gray-600">{ligne.quantite}</td>
                    <td className="py-3 text-right text-gray-600">{ligne.prix_unitaire?.toFixed(2)} €</td>
                    <td className="py-3 text-right font-medium text-[#040741]">{ligne.total_ligne?.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="flex justify-end mb-8">
            <div className="w-72 bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between py-2 text-gray-600">
                <span>Sous-total HT</span>
                <span>{devis.total_ht?.toFixed(2)} €</span>
              </div>
              {devis.remise_globale > 0 && (
                <div className="flex justify-between py-2 text-green-600">
                  <span>Remise</span>
                  <span>-{devis.remise_globale?.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between py-2 text-gray-600">
                <span>TVA (20%)</span>
                <span>{((devis.total_ttc || 0) - (devis.total_ht || 0)).toFixed(2)} €</span>
              </div>
              <div className="flex justify-between py-3 border-t border-gray-200 mt-2">
                <span className="font-bold text-[#040741] text-lg">Total TTC</span>
                <span className="font-bold text-[#313ADF] text-xl">{devis.total_ttc?.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Pied de page */}
          <div className="grid grid-cols-2 gap-8 text-xs text-gray-500 border-t border-gray-200 pt-6">
            <div>
              <p className="font-bold text-[#040741] text-sm mb-2">Règlement</p>
              <p>Par virement bancaire:</p>
              <p>IBAN: FR76 1234 5678 9012</p>
              <p>BIC: AGRIFRPP</p>
            </div>
            <div>
              <p className="font-bold text-[#040741] text-sm mb-2">Conditions</p>
              <p>En cas de retard de paiement, une indemnité de 3 fois le taux d'intérêt légal ainsi qu'une indemnité forfaitaire de 40€ seront exigibles.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bouton Retour */}
      <div className="flex justify-center mt-8">
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
    </div>
  )
}
