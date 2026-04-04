import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  getSAVTicket,
  updateSAVStatus,
  resolveSAVTicket,
  addSAVComment,
  updateSAVItemAction,
  generateAvoir,
} from '../services/savService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const STATUS_BADGES = {
  ouvert:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Ouvert' },
  en_cours: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'En cours' },
  resolu:   { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Résolu' },
  clos:     { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Clos' },
}

const TYPE_LABELS = {
  retour:      'Retour produit',
  reclamation: 'Réclamation',
  garantie:    'Garantie',
  avoir:       'Avoir',
}

const PRIORITY_COLORS = {
  faible:  'bg-gray-100 text-gray-600',
  normale: 'bg-blue-100 text-blue-600',
  urgente: 'bg-red-100 text-red-600',
}

const HISTORY_ICONS = {
  created:        { icon: '🎫', label: 'Ticket créé' },
  status_changed: { icon: '🔄', label: 'Statut modifié' },
  comment:        { icon: '💬', label: 'Commentaire' },
  resolved:       { icon: '✅', label: 'Résolu' },
  item_updated:   { icon: '📦', label: 'Article mis à jour' },
  restocked:      { icon: '🏪', label: 'Remis en stock' },
  avoir_generated:{ icon: '📄', label: 'Avoir généré' },
}

const ACTION_OPTIONS = [
  { value: 'en_attente',    label: 'À définir' },
  { value: 'remboursement', label: 'Remboursement' },
  { value: 'echange',       label: 'Échange' },
  { value: 'reparation',    label: 'Réparation' },
  { value: 'rejet',         label: 'Rejet' },
]

export default function ApercuSAV() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { workspace, isAdmin } = useWorkspace()
  const toast = useToast()

  const [ticket, setTicket] = useState(null)
  const [items, setItems] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  // Modals / panneaux
  const [showResolvePanel, setShowResolvePanel] = useState(false)
  const [resolution, setResolution] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [resolving, setResolving] = useState(false)

  const [comment, setComment] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  const [statusChanging, setStatusChanging] = useState(false)
  const [avoirLoading, setAvoirLoading] = useState(false)

  useEffect(() => {
    loadTicket()
  }, [id])

  const loadTicket = async () => {
    setLoading(true)
    try {
      const { ticket: t, items: i, history: h } = await getSAVTicket(id)
      setTicket(t)
      setItems(i)
      setHistory(h)
      setResolution(t.resolution || '')
      setRefundAmount(t.refund_amount ? String(t.refund_amount) : '')
    } catch (err) {
      console.error('Erreur chargement ticket SAV:', err)
      toast.error('Ticket introuvable')
      navigate('/sav')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (statusChanging) return
    setStatusChanging(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await updateSAVStatus(id, user.id, newStatus)
      toast.success(`Statut mis à jour : ${STATUS_BADGES[newStatus]?.label}`)
      await loadTicket()
    } catch (err) {
      toast.error('Erreur lors du changement de statut')
    } finally {
      setStatusChanging(false)
    }
  }

  const handleResolve = async () => {
    if (!resolution.trim()) { toast.error('La résolution est requise'); return }
    setResolving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await resolveSAVTicket(id, user.id, {
        resolution: resolution.trim(),
        refundAmount: parseFloat(refundAmount) || 0,
        newStatus: 'resolu',
      })
      toast.success('Ticket résolu')
      setShowResolvePanel(false)
      await loadTicket()
    } catch (err) {
      toast.error('Erreur lors de la résolution')
    } finally {
      setResolving(false)
    }
  }

  const handleAddComment = async () => {
    if (!comment.trim()) return
    setCommentSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await addSAVComment(id, user.id, comment.trim())
      setComment('')
      toast.success('Commentaire ajouté')
      await loadTicket()
    } catch (err) {
      toast.error('Erreur lors de l\'ajout du commentaire')
    } finally {
      setCommentSaving(false)
    }
  }

  const handleGenerateAvoir = async () => {
    setAvoirLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const invoice = await generateAvoir(id, user.id)
      toast.success(`Avoir ${invoice.invoice_number} créé avec succès`)
      await loadTicket()
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la génération de l\'avoir')
    } finally {
      setAvoirLoading(false)
    }
  }

  const handleItemAction = async (itemId, action) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await updateSAVItemAction(itemId, id, user.id, action)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, action } : i))
    } catch (err) {
      toast.error('Erreur mise à jour article')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Chargement…
      </div>
    )
  }

  if (!ticket) return null

  const statusBadge = STATUS_BADGES[ticket.status] || STATUS_BADGES.ouvert
  const clientName = ticket.customers
    ? `${ticket.customers.first_name || ''} ${ticket.customers.last_name || ''}`.trim()
    : null
  const isClosed = ticket.status === 'clos' || ticket.status === 'resolu'

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/sav')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0 mt-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[#040741]">{ticket.ticket_number}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge.bg} ${statusBadge.text}`}>
                {statusBadge.label}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_COLORS[ticket.priority]}`}>
                {ticket.priority === 'urgente' ? '🔴 ' : ''}{ticket.priority}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                {TYPE_LABELS[ticket.type] || ticket.type}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Créé le {new Date(ticket.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              {ticket.created_profile?.full_name && ` par ${ticket.created_profile.full_name}`}
            </p>
          </div>
        </div>

        {/* Actions rapides statut */}
        {!isClosed && isAdmin && (
          <div className="flex gap-2 flex-shrink-0">
            {ticket.status === 'ouvert' && (
              <button
                onClick={() => handleStatusChange('en_cours')}
                disabled={statusChanging}
                className="px-4 py-2 bg-orange-100 text-orange-700 text-sm font-semibold rounded-xl hover:bg-orange-200 transition-colors disabled:opacity-50"
              >
                Prendre en charge
              </button>
            )}
            {ticket.status !== 'resolu' && (
              <button
                onClick={() => setShowResolvePanel(true)}
                className="px-4 py-2 bg-green-100 text-green-700 text-sm font-semibold rounded-xl hover:bg-green-200 transition-colors"
              >
                Résoudre
              </button>
            )}
            {ticket.status === 'resolu' && (
              <button
                onClick={() => handleStatusChange('clos')}
                disabled={statusChanging}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Clore
              </button>
            )}
            {(ticket.type === 'retour' || ticket.type === 'avoir') && !ticket.avoir_generated && (ticket.refund_amount > 0) && (
              <button
                onClick={handleGenerateAvoir}
                disabled={avoirLoading}
                className="px-4 py-2 bg-purple-100 text-purple-700 text-sm font-semibold rounded-xl hover:bg-purple-200 transition-colors disabled:opacity-50"
              >
                {avoirLoading ? 'Génération…' : 'Générer avoir'}
              </button>
            )}
            {ticket.avoir_generated && (
              <span className="px-4 py-2 bg-green-50 text-green-600 text-sm font-semibold rounded-xl border border-green-200">
                ✓ Avoir généré
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-5">

          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Description</h2>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Résolution (si renseignée) */}
          {ticket.resolution && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Résolution
              </h2>
              <p className="text-sm text-green-800 whitespace-pre-wrap">{ticket.resolution}</p>
              {ticket.refund_amount > 0 && (
                <p className="mt-2 text-sm font-semibold text-green-700">Remboursement : {ticket.refund_amount} €</p>
              )}
            </div>
          )}

          {/* Panel résolution */}
          {showResolvePanel && (
            <div className="bg-white border-2 border-green-300 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide">Résoudre le ticket</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Résolution *</label>
                <textarea
                  value={resolution}
                  onChange={e => setResolution(e.target.value)}
                  rows={3}
                  placeholder="Décrivez comment le problème a été résolu…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Montant remboursé (€) <span className="text-gray-400 font-normal">optionnel</span></label>
                <input
                  type="number" min="0" step="0.01"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowResolvePanel(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleResolve}
                  disabled={resolving || !resolution.trim()}
                  className="flex-1 bg-green-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors"
                >
                  {resolving ? 'Enregistrement…' : 'Marquer comme résolu'}
                </button>
              </div>
            </div>
          )}

          {/* Articles */}
          {items.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Articles concernés</h2>
              <div className="space-y-3">
                {items.map(item => (
                  <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {item.products?.name || item.description || 'Article non identifié'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Qté: {item.quantity} · État: {item.condition}
                        {item.restocked && ' · ✅ Remis en stock'}
                      </p>
                    </div>
                    {!isClosed ? (
                      <select
                        value={item.action}
                        onChange={e => handleItemAction(item.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#313ADF] bg-white"
                      >
                        {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-1.5 rounded-lg">
                        {ACTION_OPTIONS.find(o => o.value === item.action)?.label || item.action}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ajouter un commentaire */}
          {!isClosed && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Ajouter un commentaire</h2>
              <div className="flex gap-3">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={2}
                  placeholder="Note interne, suivi client, mise à jour…"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] resize-none"
                />
                <button
                  onClick={handleAddComment}
                  disabled={commentSaving || !comment.trim()}
                  className="flex-shrink-0 bg-[#313ADF] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#040741] disabled:opacity-40 transition-colors"
                >
                  {commentSaving ? '…' : 'Envoyer'}
                </button>
              </div>
            </div>
          )}

          {/* Journal d'activité */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Journal d'activité</h2>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune activité</p>
            ) : (
              <div className="space-y-3">
                {history.map(entry => {
                  const meta = HISTORY_ICONS[entry.action] || { icon: '•', label: entry.action }
                  return (
                    <div key={entry.id} className="flex items-start gap-3">
                      <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-600">{meta.label}</span>
                          {entry.profiles?.full_name && (
                            <span className="text-xs text-gray-400">par {entry.profiles.full_name}</span>
                          )}
                          {entry.metadata?.from && entry.metadata?.to && (
                            <span className="text-xs text-gray-400">
                              {STATUS_BADGES[entry.metadata.from]?.label} → {STATUS_BADGES[entry.metadata.to]?.label}
                            </span>
                          )}
                        </div>
                        {entry.comment && (
                          <p className="text-sm text-gray-700 mt-0.5">{entry.comment}</p>
                        )}
                        <p className="text-[11px] text-gray-300 mt-0.5">
                          {new Date(entry.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-4">

          {/* Infos client */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Client</h3>
            {clientName ? (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-[#040741]">{clientName}</p>
                {ticket.customers?.phone && (
                  <a href={`tel:${ticket.customers.phone}`} className="flex items-center gap-1.5 text-sm text-[#313ADF] hover:underline">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {ticket.customers.phone}
                  </a>
                )}
                {ticket.customers?.email && (
                  <p className="text-xs text-gray-400">{ticket.customers.email}</p>
                )}
                {ticket.customers?.city && (
                  <p className="text-xs text-gray-400">{ticket.customers.city}</p>
                )}
                <button
                  onClick={() => navigate(`/clients/${ticket.customers.id}`)}
                  className="text-xs text-[#313ADF] hover:underline mt-1"
                >
                  Voir la fiche client →
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucun client associé</p>
            )}
          </div>

          {/* Commande liée */}
          {ticket.orders && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Commande</h3>
              <p className="text-sm font-semibold text-[#040741]">{ticket.orders.order_number}</p>
              <p className="text-xs text-gray-400 mt-0.5">{ticket.orders.total_ttc} € · {ticket.orders.status}</p>
              <button
                onClick={() => navigate(`/commandes/${ticket.orders.id}`)}
                className="text-xs text-[#313ADF] hover:underline mt-1.5"
              >
                Voir la commande →
              </button>
            </div>
          )}

          {/* Assignation */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Assigné à</h3>
            <p className="text-sm text-gray-700">
              {ticket.assigned_profile?.full_name || 'Non assigné'}
            </p>
          </div>

          {/* Dates */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dates</h3>
            <div className="space-y-1.5 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Créé</span>
                <span className="font-medium text-gray-700">{new Date(ticket.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Mis à jour</span>
                <span className="font-medium text-gray-700">{new Date(ticket.updated_at).toLocaleDateString('fr-FR')}</span>
              </div>
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <span>Résolu</span>
                  <span className="font-medium text-green-600">{new Date(ticket.resolved_at).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Lien commande depuis SAV si créé depuis ApercuCommande */}
          {!isClosed && isAdmin && (
            <button
              onClick={() => navigate(`/sav/nouveau?order_id=${ticket.orders?.id || ''}&customer_id=${ticket.customers?.id || ''}`)}
              className="w-full border border-dashed border-gray-200 text-gray-400 hover:text-[#313ADF] hover:border-[#313ADF] py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              + Créer un nouveau ticket lié
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
