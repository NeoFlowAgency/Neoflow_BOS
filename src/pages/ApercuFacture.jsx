import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generatePdf, sendEmail } from '../services/edgeFunctionService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function ApercuFacture() {
  const { factureId } = useParams()
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const toast = useToast()
  const [facture, setFacture] = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [actionMessage, setActionMessage] = useState({ type: '', text: '' })

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    loadFacture()
  }, [factureId, workspace?.id, wsLoading])

  const loadFacture = async () => {
    try {
      const { data: factureData, error: factureError } = await supabase
        .from('invoices')
        .select('*, customers(*)')
        .eq('id', factureId)
        .eq('workspace_id', workspace.id)
        .single()

      if (factureError) {
        console.error('[ApercuFacture] Erreur chargement facture:', factureError.message)
        setFacture(null)
        setLoading(false)
        return
      }

      const { data: lignesData, error: lignesError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', factureId)

      if (lignesError) {
        console.error('[ApercuFacture] Erreur chargement lignes:', lignesError.message)
      }

      setFacture(factureData)
      setLignes(lignesData || [])
    } catch (err) {
      console.error('[ApercuFacture] Erreur:', err.message, err)
    } finally {
      setLoading(false)
    }
  }

  const handleSendEmail = async () => {
    if (!facture?.customers?.email) {
      setActionMessage({ type: 'error', text: 'Pas d\'email client disponible' })
      return
    }

    setActionLoading('email')
    setActionMessage({ type: '', text: '' })

    try {
      await sendEmail(
        facture.customers.email,
        `Facture ${facture.invoice_number}`,
        `<h1>Votre facture</h1><p>Veuillez trouver ci-joint votre facture n° ${facture.invoice_number} d'un montant de ${facture.total_ttc?.toFixed(2)} €.</p>`
      )
      setActionMessage({ type: 'success', text: 'Email envoyé avec succès !' })
      toast.success('Email envoyé avec succès !')

      await supabase.from('invoices').update({ status: 'envoyée' }).eq('id', factureId).eq('workspace_id', workspace.id)
      loadFacture()
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
      const response = await generatePdf('invoice', factureId)

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
      const { error } = await supabase.from('deliveries').insert({
        invoice_id: factureId,
        workspace_id: workspace.id,
        scheduled_date: new Date().toISOString().split('T')[0],
        delivery_address: facture?.customers?.address,
        status: 'en_cours'
      })
      if (error) throw error
      setActionMessage({ type: 'success', text: 'Livraison créée !' })
      toast.success('Livraison créée !')
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Erreur lors de la création' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkPaid = async () => {
    if (!window.confirm('Confirmer le paiement de cette facture ?')) return

    setActionLoading('paid')
    setActionMessage({ type: '', text: '' })

    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'payée', paid_at: new Date().toISOString() })
        .eq('id', factureId)
        .eq('workspace_id', workspace.id)

      if (error) throw error

      setActionMessage({ type: 'success', text: 'Facture marquée comme payée !' })
      toast.success('Facture marquée comme payée !')
      loadFacture()
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Erreur' })
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendReminder = async () => {
    if (!facture?.customers?.email) {
      setActionMessage({ type: 'error', text: 'Pas d\'email client disponible pour la relance' })
      return
    }

    setActionLoading('reminder')
    setActionMessage({ type: '', text: '' })

    try {
      await sendEmail(
        facture.customers.email,
        `Relance - Facture ${facture.invoice_number}`,
        `<h1>Relance de paiement</h1><p>Nous vous rappelons que votre facture n° ${facture.invoice_number} d'un montant de ${facture.total_ttc?.toFixed(2)} € est en attente de règlement.</p><p>Merci de procéder au paiement dans les meilleurs délais.</p>`
      )
      setActionMessage({ type: 'success', text: 'Relance de paiement envoyée !' })
      toast.success('Relance envoyée !')
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Erreur lors de la relance' })
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

  if (!facture) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-500 mb-4">Facture non trouvée</p>
        <button
          onClick={() => navigate('/factures')}
          className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold"
        >
          Retour aux factures
        </button>
      </div>
    )
  }

  const client = facture.customers

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#040741] mb-1">Aperçu de la facture</h1>
          <p className="text-gray-500">N° {facture.invoice_number}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
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

          {facture?.status !== 'payée' && (
            <button
              onClick={handleMarkPaid}
              disabled={actionLoading === 'paid'}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'paid' ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              Marquer payée
            </button>
          )}

          {facture?.status === 'envoyée' && (
            <button
              onClick={handleSendReminder}
              disabled={actionLoading === 'reminder'}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'reminder' ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              )}
              Relance paiement
            </button>
          )}
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
              <p className="text-sm text-gray-500">{workspace?.name || ''}</p>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-[#040741] mb-2">FACTURE</h2>
              <p className="text-sm text-gray-600">N°: {facture.invoice_number}</p>
              <p className="text-sm text-gray-600">Date: {new Date(facture.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
          </div>

          {/* Émetteur / Destinataire */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="font-bold text-[#313ADF] text-sm mb-2">ÉMETTEUR</p>
              <p className="font-medium text-[#040741]">{workspace?.name || 'Entreprise'}</p>
              {workspace?.address && <p className="text-gray-600 text-sm">{workspace.address}</p>}
              {workspace?.vat_number && <p className="text-gray-600 text-sm">TVA: {workspace.vat_number}</p>}
            </div>
            <div className="text-right">
              <p className="font-bold text-[#313ADF] text-sm mb-2">DESTINATAIRE</p>
              <p className="font-medium text-[#040741]">{client?.first_name} {client?.last_name}</p>
              <p className="text-gray-600 text-sm">{client?.email || ''}</p>
              <p className="text-gray-600 text-sm">{client?.address}</p>
              <p className="text-gray-600 text-sm">{client?.phone}</p>
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
                    <td className="py-3 text-[#040741]">{ligne.description || 'Produit'}</td>
                    <td className="py-3 text-center text-gray-600">{ligne.quantity}</td>
                    <td className="py-3 text-right text-gray-600">{ligne.unit_price_ht?.toFixed(2)} €</td>
                    <td className="py-3 text-right font-medium text-[#040741]">{ligne.total_ht?.toFixed(2)} €</td>
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
                <span>{facture.subtotal_ht?.toFixed(2)} €</span>
              </div>
              {facture.discount_global > 0 && (
                <div className="flex justify-between py-2 text-green-600">
                  <span>Remise</span>
                  <span>-{facture.discount_global?.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between py-2 text-gray-600">
                <span>TVA ({facture.tva_rate || 20}%)</span>
                <span>{((facture.total_ttc || 0) - (facture.subtotal_ht || 0)).toFixed(2)} €</span>
              </div>
              <div className="flex justify-between py-3 border-t border-gray-200 mt-2">
                <span className="font-bold text-[#040741] text-lg">Total TTC</span>
                <span className="font-bold text-[#313ADF] text-xl">{facture.total_ttc?.toFixed(2)} €</span>
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
          onClick={() => navigate('/factures')}
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
