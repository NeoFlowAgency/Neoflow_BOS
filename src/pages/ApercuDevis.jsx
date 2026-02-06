import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { n8nService } from '../services/n8nService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

export default function ApercuDevis() {
  const { devisId } = useParams()
  const navigate = useNavigate()
  const { workspace, loading: wsLoading } = useWorkspace()
  const toast = useToast()
  const [devis, setDevis] = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)

  useEffect(() => {
    if (wsLoading) return
    if (!workspace?.id) {
      setLoading(false)
      return
    }
    loadDevis()
  }, [devisId, workspace?.id, wsLoading])

  const loadDevis = async () => {
    try {
      const { data: devisData, error: devisError } = await supabase
        .from('quotes')
        .select('*, customers(*)')
        .eq('id', devisId)
        .eq('workspace_id', workspace.id)
        .single()

      if (devisError) {
        console.error('[ApercuDevis] Erreur chargement:', devisError.message)
        setDevis(null)
        setLoading(false)
        return
      }

      const { data: lignesData } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', devisId)

      setDevis(devisData)
      setLignes(lignesData || [])
    } catch (err) {
      console.error('[ApercuDevis] Erreur:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConvertToInvoice = async () => {
    setActionLoading('convert')
    try {
      const result = await n8nService.convertQuoteToInvoice(devis.id)
      toast.success(`Facture ${result.invoice_ref || ''} créée !`)

      // Update quote status
      await supabase
        .from('quotes')
        .update({ status: 'accepted' })
        .eq('id', devis.id)
        .eq('workspace_id', workspace.id)

      const invoiceId = result.invoice_id || result.id
      if (invoiceId) {
        navigate(`/factures/${invoiceId}`)
      } else {
        navigate('/factures')
      }
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la conversion')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendEmail = async () => {
    if (!devis?.customers?.email) {
      toast.error("Pas d'email client disponible")
      return
    }

    setActionLoading('email')
    try {
      await n8nService.sendEmail(
        devis.customers.email,
        `Devis ${devis.quote_ref || ''}`,
        `<h1>Votre devis</h1><p>Veuillez trouver ci-joint votre devis d'un montant de ${devis.total_amount?.toFixed(2)} €.</p>`
      )
      toast.success('Email envoyé avec succès !')

      await supabase
        .from('quotes')
        .update({ status: 'sent' })
        .eq('id', devis.id)
        .eq('workspace_id', workspace.id)

      loadDevis()
    } catch (err) {
      toast.error(err.message || "Erreur lors de l'envoi")
    } finally {
      setActionLoading(null)
    }
  }

  const handleDownloadPdf = async () => {
    setActionLoading('pdf')
    try {
      const response = await n8nService.generatePdf('quote', devis.id)
      if (response.pdf_url) {
        window.open(response.pdf_url, '_blank')
        toast.success('PDF généré !')
      } else {
        throw new Error('URL PDF non retournée')
      }
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la génération du PDF')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async () => {
    setActionLoading('reject')
    try {
      await supabase
        .from('quotes')
        .update({ status: 'rejected' })
        .eq('id', devis.id)
        .eq('workspace_id', workspace.id)

      toast.info('Devis marqué comme refusé')
      loadDevis()
    } catch (err) {
      toast.error('Erreur lors de la mise à jour')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatutBadge = (statut) => {
    const badges = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
      sent: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Envoyé' },
      accepted: { bg: 'bg-green-100', text: 'text-green-600', label: 'Accepté' },
      rejected: { bg: 'bg-red-100', text: 'text-red-600', label: 'Refusé' },
      expired: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Expiré' }
    }
    const badge = badges[statut] || badges.draft
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
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

  const client = devis.customers

  return (
    <div className="p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-[#040741]">Aperçu du devis</h1>
            {getStatutBadge(devis.status)}
          </div>
          <p className="text-gray-500">Réf. {devis.quote_ref || devis.id?.slice(0, 8)}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          {devis.status !== 'accepted' && devis.status !== 'rejected' && (
            <button
              onClick={handleConvertToInvoice}
              disabled={actionLoading === 'convert'}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'convert' ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              Convertir en facture
            </button>
          )}

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

          {devis.status !== 'accepted' && devis.status !== 'rejected' && (
            <button
              onClick={handleReject}
              disabled={actionLoading === 'reject'}
              className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-red-300 text-red-500 rounded-xl font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Refuser
            </button>
          )}
        </div>
      </div>

      {/* Aperçu du devis */}
      <div className="flex justify-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 max-w-3xl w-full">
          {/* En-tête */}
          <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-100">
            <div>
              <img src="/logo-neoflow.png" alt="Neoflow Agency" className="h-12 mb-2" />
              <p className="text-sm text-gray-500">{workspace?.name || ''}</p>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-[#040741] mb-2">DEVIS</h2>
              <p className="text-sm text-gray-600">Réf: {devis.quote_ref || devis.id?.slice(0, 8)}</p>
              <p className="text-sm text-gray-600">Date: {new Date(devis.issue_date || devis.created_at).toLocaleDateString('fr-FR')}</p>
              {devis.expiry_date && (
                <p className="text-sm text-gray-600">Valide jusqu'au: {new Date(devis.expiry_date).toLocaleDateString('fr-FR')}</p>
              )}
            </div>
          </div>

          {/* Émetteur / Destinataire */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="font-bold text-[#313ADF] text-sm mb-2">ÉMETTEUR</p>
              <p className="font-medium text-[#040741]">{workspace?.name || 'Entreprise'}</p>
              {workspace?.address && <p className="text-gray-600 text-sm">{workspace.address}</p>}
            </div>
            <div className="text-right">
              <p className="font-bold text-[#313ADF] text-sm mb-2">DESTINATAIRE</p>
              <p className="font-medium text-[#040741]">{client?.first_name} {client?.last_name}</p>
              <p className="text-gray-600 text-sm">{client?.email || ''}</p>
              <p className="text-gray-600 text-sm">{client?.address}</p>
              <p className="text-gray-600 text-sm">{client?.phone}</p>
            </div>
          </div>

          {/* Tableau items */}
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
                    <td className="py-3 text-right text-gray-600">{ligne.unit_price?.toFixed(2)} €</td>
                    <td className="py-3 text-right font-medium text-[#040741]">{ligne.total_price?.toFixed(2)} €</td>
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
                <span>{devis.subtotal?.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between py-2 text-gray-600">
                <span>TVA (20%)</span>
                <span>{devis.tax_amount?.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between py-3 border-t border-gray-200 mt-2">
                <span className="font-bold text-[#040741] text-lg">Total TTC</span>
                <span className="font-bold text-[#313ADF] text-xl">{devis.total_amount?.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {devis.notes && (
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="font-bold text-[#040741] text-sm mb-2">Notes</p>
              <p className="text-gray-600 text-sm">{devis.notes}</p>
            </div>
          )}

          {/* Pied de page */}
          <div className="text-xs text-gray-500 border-t border-gray-200 pt-6">
            <p>Ce devis est valable {devis.expiry_date ? `jusqu'au ${new Date(devis.expiry_date).toLocaleDateString('fr-FR')}` : '30 jours'}. Passé ce délai, il devra être renouvelé.</p>
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
