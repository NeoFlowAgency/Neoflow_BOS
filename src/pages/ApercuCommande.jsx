import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOrder, updateOrderStatus, createPayment, listPayments, deleteOrder, generateInvoiceFromOrder } from '../services/orderService'
import { debitStock, listStockLocations } from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { canViewMargins } from '../lib/permissions'
import PaymentModal from '../components/PaymentModal'

const STATUS_BADGES = {
  brouillon: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
  confirme: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Confirme' },
  en_preparation: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'En preparation' },
  en_livraison: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'En livraison' },
  en_cours: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'En cours' },
  livre: { bg: 'bg-purple-100', text: 'text-purple-600', label: 'Livre' },
  termine: { bg: 'bg-green-100', text: 'text-green-600', label: 'Termine' },
  annule: { bg: 'bg-red-100', text: 'text-red-600', label: 'Annule' }
}

const STATUS_FLOW = {
  brouillon: ['confirme', 'annule'],
  confirme: ['en_preparation', 'annule'],
  en_preparation: ['en_livraison', 'annule'],
  en_livraison: ['termine', 'annule'],
  en_cours: ['livre', 'annule'],
  livre: ['termine', 'annule'],
  termine: [],
  annule: []
}

export default function ApercuCommande() {
  const { commandeId } = useParams()
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()
  const toast = useToast()

  const [order, setOrder] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Livraison creation
  const [showCreateDelivery, setShowCreateDelivery] = useState(false)
  const [deliveryForm, setDeliveryForm] = useState({ scheduled_date: '', delivery_address: '', time_slot: '', assigned_to: '', notes: '' })
  const [createDeliveryLoading, setCreateDeliveryLoading] = useState(false)
  const [workspaceMembers, setWorkspaceMembers] = useState([])

  const showMargins = canViewMargins(role)

  useEffect(() => {
    if (workspace?.id && commandeId) {
      loadOrder()
    }
  }, [workspace?.id, commandeId])

  const loadOrder = async () => {
    try {
      const data = await getOrder(commandeId)
      setOrder(data)
      const paymentList = await listPayments(commandeId)
      setPayments(paymentList)
    } catch (err) {
      console.error('Erreur chargement commande:', err)
      toast.error('Erreur lors du chargement de la commande')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (newStatus) => {
    setActionLoading(newStatus)
    try {
      await updateOrderStatus(commandeId, newStatus)
      toast.success(`Statut mis a jour : ${STATUS_BADGES[newStatus]?.label || newStatus}`)
      loadOrder()
    } catch (err) {
      toast.error(err.message || 'Erreur mise a jour statut')
    } finally {
      setActionLoading(null)
    }
  }

  const handlePayment = async (paymentData) => {
    setPaymentLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const isFirstPayment = payments.length === 0
      const orderItems = order?.items || []
      await createPayment(workspace.id, commandeId, user.id, paymentData)

      // Debiter le stock au premier paiement
      if (isFirstPayment && orderItems.length > 0) {
        try {
          const locData = await listStockLocations(workspace.id)
          const defaultLoc = locData.find(l => l.is_default) || locData[0]
          if (defaultLoc) {
            await debitStock(workspace.id, commandeId, orderItems, defaultLoc.id, user.id)
          }
        } catch (stockErr) {
          console.warn('Debit stock non effectue:', stockErr.message)
        }
      }

      // Auto-transition statut selon le paiement
      const newAmountPaid = (order.amount_paid || 0) + (paymentData.amount || 0)
      const isFullyPaid = newAmountPaid >= (order.total_ttc || 0) - 0.01

      if (isFullyPaid && ['confirme', 'en_preparation', 'en_livraison', 'livre'].includes(order.status)) {
        try {
          await updateOrderStatus(commandeId, 'termine')
          toast.success('Paiement enregistre ! Commande marquee comme terminee.')
        } catch {
          toast.success('Paiement enregistre !')
        }
      } else if (isFirstPayment && order.requires_delivery && order.status === 'confirme') {
        try {
          await updateOrderStatus(commandeId, 'en_preparation')
          toast.success('Paiement enregistre ! Commande passee en preparation.')
        } catch {
          toast.success('Paiement enregistre !')
        }
      } else {
        toast.success('Paiement enregistre !')
      }

      setShowPaymentModal(false)
      loadOrder()
    } catch (err) {
      toast.error(err.message || 'Erreur paiement')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleGenerateInvoice = async (category) => {
    setActionLoading('invoice-' + category)
    try {
      const result = await generateInvoiceFromOrder(commandeId, category)
      const invoiceId = result?.invoice_id
      toast.success('Facture generee !')
      if (invoiceId) {
        navigate(`/factures/${invoiceId}`)
      } else {
        loadOrder()
      }
    } catch (err) {
      toast.error(err.message || 'Erreur generation facture')
    } finally {
      setActionLoading(null)
    }
  }

  const openCreateDelivery = async () => {
    setDeliveryForm({
      scheduled_date: '',
      delivery_address: client?.address || '',
      time_slot: '',
      assigned_to: '',
      notes: order.notes || ''
    })
    if (workspaceMembers.length === 0) {
      const { data } = await supabase
        .from('workspace_users')
        .select('user_id, role, profiles:user_id(full_name)')
        .eq('workspace_id', workspace.id)
      setWorkspaceMembers(data || [])
    }
    setShowCreateDelivery(true)
  }

  const handleCreateDelivery = async () => {
    setCreateDeliveryLoading(true)
    try {
      const { error } = await supabase.from('deliveries').insert({
        workspace_id: workspace.id,
        order_id: commandeId,
        delivery_type: order.delivery_type || 'delivery',
        status: 'a_planifier',
        scheduled_date: deliveryForm.scheduled_date || null,
        delivery_address: deliveryForm.delivery_address || null,
        time_slot: deliveryForm.time_slot || null,
        assigned_to: deliveryForm.assigned_to || null,
        notes: deliveryForm.notes || null
      })
      if (error) throw error
      toast.success('Livraison creee !')
      setShowCreateDelivery(false)
      loadOrder()
    } catch (err) {
      toast.error(err.message || 'Erreur creation livraison')
    } finally {
      setCreateDeliveryLoading(false)
    }
  }

  const handleDelete = async () => {
    setActionLoading('delete')
    try {
      await deleteOrder(commandeId)
      toast.success('Commande supprimee')
      navigate('/commandes')
    } catch (err) {
      toast.error(err.message || 'Erreur suppression')
    } finally {
      setActionLoading(null)
      setShowDeleteConfirm(false)
    }
  }

  const getStatusBadge = (status) => {
    const badge = STATUS_BADGES[status] || STATUS_BADGES.brouillon
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

  if (!order) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-500 mb-4">Commande non trouvee</p>
        <button onClick={() => navigate('/commandes')} className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold">
          Retour aux commandes
        </button>
      </div>
    )
  }

  const client = order.customer
  const items = order.items || []
  const invoices = order.invoices || []
  const deliveries = order.deliveries || []
  const nextStatuses = STATUS_FLOW[order.status] || []
  const paymentRatio = (order.total_ttc || 0) > 0 ? ((order.amount_paid || 0) / order.total_ttc) : 0

  // Calcul marge
  const totalCost = showMargins ? items.reduce((sum, item) => sum + ((item.cost_price_ht || 0) * (item.quantity || 0)), 0) : 0
  const margin = showMargins ? (order.subtotal_ht || 0) - totalCost : 0

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-5xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">{order.order_number}</h1>
            {getStatusBadge(order.status)}
            {order.order_type === 'quick_sale' && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">Vente rapide</span>
            )}
          </div>
          <p className="text-gray-500">Creee le {new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
        </div>

        {/* Actions statut */}
        <div className="flex gap-2 flex-wrap">
          {nextStatuses.map(status => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={actionLoading === status}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 ${
                status === 'annule'
                  ? 'bg-white border-2 border-red-300 text-red-500 hover:bg-red-50'
                  : 'bg-[#313ADF] text-white hover:bg-[#4149e8]'
              }`}
            >
              {actionLoading === status ? 'Mise a jour...' : `Passer en ${STATUS_BADGES[status]?.label}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-6">
          {/* Barre de progression paiement */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#040741]">Progression du paiement</span>
              <span className="text-sm font-medium text-[#040741]">
                {(order.amount_paid || 0).toFixed(2)} / {(order.total_ttc || 0).toFixed(2)} EUR
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${paymentRatio >= 1 ? 'bg-green-500' : paymentRatio > 0 ? 'bg-[#313ADF]' : 'bg-gray-300'}`}
                style={{ width: `${Math.min(100, paymentRatio * 100)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-gray-400">{Math.round(paymentRatio * 100)}% paye</span>
              {(order.remaining_amount || 0) > 0 && (
                <span className="text-xs font-medium text-orange-600">Restant : {(order.remaining_amount || 0).toFixed(2)} EUR</span>
              )}
            </div>
          </div>

          {/* Informations client */}
          {client && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
              <h3 className="text-sm font-bold text-[#040741] mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Client
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="font-medium text-[#040741]">{client.first_name} {client.last_name}</p>
                  {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
                  {client.email && <p className="text-sm text-gray-500">{client.email}</p>}
                </div>
                {client.address && (
                  <p className="text-sm text-gray-500">{client.address}</p>
                )}
              </div>
              <button
                onClick={() => navigate(`/clients/${client.id}`)}
                className="mt-3 text-sm text-[#313ADF] font-medium hover:underline"
              >
                Voir la fiche client
              </button>
            </div>
          )}

          {/* Lignes de commande */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
            <h3 className="text-sm font-bold text-[#040741] mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Produits ({items.length})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-xs font-semibold text-gray-500">Description</th>
                    <th className="text-center py-2 text-xs font-semibold text-gray-500">Qte</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500">Prix unit.</th>
                    {showMargins && <th className="text-right py-2 text-xs font-semibold text-gray-500">Cout</th>}
                    <th className="text-right py-2 text-xs font-semibold text-gray-500">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-3">
                        <p className="font-medium text-[#040741] text-sm">{item.description || item.product?.name || 'Produit'}</p>
                        {item.product?.reference && <p className="text-xs text-gray-400">{item.product.reference}</p>}
                      </td>
                      <td className="py-3 text-center text-sm text-gray-600">{item.quantity}</td>
                      <td className="py-3 text-right text-sm text-gray-600">{(item.unit_price_ht || 0).toFixed(2)} EUR</td>
                      {showMargins && (
                        <td className="py-3 text-right text-sm text-gray-400">{(item.cost_price_ht || 0).toFixed(2)} EUR</td>
                      )}
                      <td className="py-3 text-right text-sm font-semibold text-[#040741]">{(item.total_ht || 0).toFixed(2)} EUR</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totaux */}
            <div className="flex justify-end mt-4">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Sous-total HT</span>
                  <span>{(order.subtotal_ht || 0).toFixed(2)} EUR</span>
                </div>
                {(order.discount_global || 0) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Remise</span>
                    <span>-{(order.discount_global || 0).toFixed(2)} EUR</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-gray-500">
                  <span>TVA</span>
                  <span>{(order.total_tva || 0).toFixed(2)} EUR</span>
                </div>
                <div className="flex justify-between font-bold text-[#040741] border-t border-gray-200 pt-2">
                  <span>Total TTC</span>
                  <span className="text-[#313ADF]">{(order.total_ttc || 0).toFixed(2)} EUR</span>
                </div>
                {showMargins && (
                  <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
                    <span className="text-gray-500">Marge</span>
                    <span className={`font-semibold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {margin.toFixed(2)} EUR
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
              <h3 className="text-sm font-bold text-[#040741] mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Colonne laterale */}
        <div className="space-y-6">
          {/* Actions rapides */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
            <h3 className="text-sm font-bold text-[#040741] mb-4">Actions</h3>
            <div className="space-y-2">
              {/* Enregistrer paiement */}
              {order.status !== 'annule' && (order.remaining_amount || 0) > 0 && (
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#313ADF] text-white rounded-xl font-medium text-sm hover:bg-[#4149e8] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Enregistrer un paiement
                </button>
              )}

              {/* Generer facture */}
              {order.status !== 'annule' && order.order_type !== 'quick_sale' && (
                <>
                  {(order.amount_paid || 0) > 0 && !invoices.some(i => i.invoice_category === 'deposit') && (
                    <button
                      onClick={() => handleGenerateInvoice('deposit')}
                      disabled={actionLoading === 'invoice-deposit'}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-[#040741] rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {actionLoading === 'invoice-deposit' ? 'Generation...' : "Facture d'acompte"}
                    </button>
                  )}
                  {paymentRatio >= 1 && !invoices.some(i => i.invoice_category === 'standard') && (
                    <button
                      onClick={() => handleGenerateInvoice('standard')}
                      disabled={actionLoading === 'invoice-standard'}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-[#040741] rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      {actionLoading === 'invoice-standard' ? 'Generation...' : 'Facture complete'}
                    </button>
                  )}
                </>
              )}

              {/* Supprimer */}
              {(role === 'proprietaire' || role === 'manager') && order.status !== 'termine' && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 bg-white border border-red-200 text-red-500 rounded-xl font-medium text-sm hover:bg-red-50 transition-colors mt-4"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Supprimer la commande
                </button>
              )}
            </div>
          </div>

          {/* Section Paiements */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
            <h3 className="text-sm font-bold text-[#040741] mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Paiements ({payments.length})
            </h3>

            {payments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun paiement enregistre</p>
            ) : (
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p.id} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-[#040741]">{(p.amount || 0).toFixed(2)} EUR</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {p.payment_method === 'cash' ? 'Especes' : p.payment_method === 'card' ? 'CB' : p.payment_method === 'check' ? 'Cheque' : p.payment_method === 'transfer' ? 'Virement' : 'Autre'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(p.payment_date).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    {p.notes && <p className="text-xs text-gray-400 mt-1">{p.notes}</p>}
                    {p.receiver && <p className="text-xs text-gray-400">Par {p.receiver.full_name}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section Factures */}
          {invoices.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
              <h3 className="text-sm font-bold text-[#040741] mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Factures ({invoices.length})
              </h3>
              <div className="space-y-2">
                {invoices.map(inv => (
                  <button
                    key={inv.id}
                    onClick={() => navigate(`/factures/${inv.id}`)}
                    className="w-full bg-gray-50 rounded-xl p-3 text-left hover:bg-[#313ADF]/5 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#313ADF]">{inv.invoice_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {inv.status === 'paid' ? 'Payee' : inv.status === 'sent' ? 'Envoyee' : 'Brouillon'}
                      </span>
                    </div>
                    {inv.invoice_category && (
                      <p className="text-xs text-gray-400 mt-1">
                        {inv.invoice_category === 'deposit' ? 'Acompte' : inv.invoice_category === 'balance' ? 'Solde' : inv.invoice_category === 'quick_sale' ? 'Vente rapide' : 'Standard'}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section Livraisons */}
          {(order.requires_delivery || deliveries.length > 0) && order.status !== 'annule' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[#040741] flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  {order.delivery_type === 'pickup' ? 'Retrait' : 'Livraison'}
                  {deliveries.length > 0 && ` (${deliveries.length})`}
                </h3>
                {deliveries.length === 0 && (
                  <button
                    onClick={openCreateDelivery}
                    className="text-xs text-[#313ADF] font-medium hover:underline flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Creer
                  </button>
                )}
              </div>
              {deliveries.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400 mb-3">Aucune livraison planifiee</p>
                  <button
                    onClick={openCreateDelivery}
                    className="px-4 py-2 bg-[#313ADF]/10 text-[#313ADF] rounded-xl text-sm font-medium hover:bg-[#313ADF]/20 transition-colors"
                  >
                    Planifier la livraison
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {deliveries.map(del => {
                    const statusMap = {
                      livree: { bg: 'bg-green-100', text: 'text-green-700', label: 'Livree' },
                      en_cours: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'En cours' },
                      planifiee: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Planifiee' },
                      a_planifier: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'A planifier' },
                      annulee: { bg: 'bg-red-100', text: 'text-red-600', label: 'Annulee' }
                    }
                    const s = statusMap[del.status] || statusMap.a_planifier
                    return (
                      <div key={del.id} className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.bg} ${s.text}`}>{s.label}</span>
                          {del.scheduled_date && (
                            <span className="text-xs text-gray-400">{new Date(del.scheduled_date).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>
                        {del.delivery_address && <p className="text-xs text-gray-400 mt-1">{del.delivery_address}</p>}
                        {del.time_slot && <p className="text-xs text-gray-400">{del.time_slot}</p>}
                      </div>
                    )
                  })}
                  <button
                    onClick={() => navigate('/livraisons')}
                    className="w-full text-xs text-[#313ADF] font-medium hover:underline mt-1"
                  >
                    Voir dans les livraisons →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Devis source */}
          {order.quote && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-5">
              <h3 className="text-sm font-bold text-[#040741] mb-3">Devis source</h3>
              <button
                onClick={() => navigate(`/devis/${order.quote.id}`)}
                className="text-sm text-[#313ADF] font-medium hover:underline"
              >
                {order.quote.quote_number || 'Voir le devis'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bouton Retour */}
      <div className="flex justify-start mt-8">
        <button
          onClick={() => navigate('/commandes')}
          className="inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Retour aux commandes
        </button>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handlePayment}
        orderTotal={order.total_ttc || 0}
        amountPaid={order.amount_paid || 0}
        loading={paymentLoading}
      />

      {/* Modal Creer Livraison */}
      {showCreateDelivery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#040741]">
                {order.delivery_type === 'pickup' ? 'Planifier le retrait' : 'Planifier la livraison'}
              </h3>
              {client && <p className="text-sm text-gray-500 mt-1">{client.first_name} {client.last_name}</p>}
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Date prevue</label>
                <input
                  type="date"
                  value={deliveryForm.scheduled_date}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, scheduled_date: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>
              {order.delivery_type !== 'pickup' && (
                <div>
                  <label className="block text-sm font-semibold text-[#040741] mb-2">Adresse de livraison</label>
                  <input
                    type="text"
                    value={deliveryForm.delivery_address}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, delivery_address: e.target.value })}
                    placeholder="15 rue des Lilas, 75001 Paris"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Creneau horaire (optionnel)</label>
                <input
                  type="text"
                  value={deliveryForm.time_slot}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, time_slot: e.target.value })}
                  placeholder="9h-12h, apres-midi..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Assigner a (optionnel)</label>
                <div className="relative">
                  <select
                    value={deliveryForm.assigned_to}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, assigned_to: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  >
                    <option value="">Non assigne</option>
                    {workspaceMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.profiles?.full_name || m.user_id} ({m.role})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Notes (optionnel)</label>
                <textarea
                  value={deliveryForm.notes}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Instructions particulieres..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 resize-none"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateDelivery(false)}
                className="px-6 py-2 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateDelivery}
                disabled={createDeliveryLoading}
                className="px-6 py-2 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#4149e8] disabled:opacity-50 flex items-center gap-2"
              >
                {createDeliveryLoading ? 'Creation...' : 'Creer la livraison'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#040741] text-center mb-2">Supprimer la commande ?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">Cette action est irreversible. Les paiements associes seront egalement supprimes.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading === 'delete'}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {actionLoading === 'delete' ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
