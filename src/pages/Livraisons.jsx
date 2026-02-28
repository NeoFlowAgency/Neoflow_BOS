import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createPayment } from '../services/orderService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import PaymentModal from '../components/PaymentModal'

// ─── Configs ────────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  '8h-10h', '9h-12h', '10h-12h', '12h-14h',
  '14h-16h', '14h-17h', '16h-18h', '17h-19h', '18h-20h',
  'Matin (8h-12h)', 'Apres-midi (14h-18h)', 'Journee entiere'
]

const COLUMNS = [
  { key: 'a_planifier', label: 'A planifier',  color: 'gray',   bg: 'bg-gray-50',    header: 'bg-gray-100',    text: 'text-gray-700' },
  { key: 'planifiee',   label: 'Planifiee',     color: 'blue',   bg: 'bg-blue-50',    header: 'bg-blue-100',    text: 'text-blue-700' },
  { key: 'en_cours',    label: 'En cours',      color: 'yellow', bg: 'bg-yellow-50',  header: 'bg-yellow-100',  text: 'text-yellow-700' },
  { key: 'livree',      label: 'Livree',        color: 'green',  bg: 'bg-green-50',   header: 'bg-green-100',   text: 'text-green-700' },
]

const DELIVERY_TYPE_BADGE = {
  delivery: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Livraison' },
  pickup:   { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'Retrait' },
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Livraisons() {
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()
  const toast = useToast()

  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [workspaceMembers, setWorkspaceMembers] = useState([])

  // Vue livreur : uniquement ses livraisons
  const isLivreur = role === 'livreur'

  // ── Modals ────────────────────────────────────────
  // Plan modal (a_planifier → planifiee)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [planTarget, setPlanTarget] = useState(null)
  const [planForm, setPlanForm] = useState({ scheduled_date: '', time_slot: '', assigned_to: '', delivery_fees: '' })
  const [planLoading, setPlanLoading] = useState(false)

  // Livraison completee (en_cours → livree) avec option paiement
  const [showLivraisonModal, setShowLivraisonModal] = useState(false)
  const [livraisonTarget, setLivraisonTarget] = useState(null)
  const [offerPayment, setOfferPayment] = useState(false)
  const [livraisonLoading, setLivraisonLoading] = useState(false)

  // PaymentModal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentOrderId, setPaymentOrderId] = useState(null)
  const [paymentOrderTotal, setPaymentOrderTotal] = useState(0)
  const [paymentAmountPaid, setPaymentAmountPaid] = useState(0)
  const [paymentLoading, setPaymentLoading] = useState(false)

  // ── Load ──────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id || null)
    })
  }, [])

  useEffect(() => {
    if (workspace?.id) {
      loadDeliveries()
      loadWorkspaceMembers()
    }
  }, [workspace?.id])

  const loadDeliveries = async () => {
    try {
      let query = supabase
        .from('deliveries')
        .select(`
          *,
          order:orders(
            id, order_number, total_ttc, remaining_amount, amount_paid,
            customer:customers(first_name, last_name, phone, address)
          )
        `)
        .eq('workspace_id', workspace.id)
        .neq('status', 'annulee')
        .order('scheduled_date', { ascending: true, nullsFirst: true })

      const { data, error } = await query
      if (error) throw error
      setDeliveries(data || [])
    } catch (err) {
      console.error('[Livraisons] Erreur:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadWorkspaceMembers = async () => {
    try {
      const { data: membersData } = await supabase
        .from('workspace_users')
        .select('user_id, role')
        .eq('workspace_id', workspace.id)

      const members = membersData || []
      const userIds = members.map(m => m.user_id).filter(Boolean)
      let profilesMap = {}
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)
        if (profilesData) {
          profilesData.forEach(p => { profilesMap[p.id] = p.full_name })
        }
      }

      setWorkspaceMembers(members.map(m => ({
        ...m,
        full_name: profilesMap[m.user_id] || null
      })))
    } catch (err) {
      console.error('[Livraisons] Erreur membres:', err)
    }
  }

  // ── Filtrage vue livreur ───────────────────────────
  const visibleDeliveries = isLivreur
    ? deliveries.filter(d => d.assigned_to === currentUserId)
    : deliveries

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.key] = visibleDeliveries.filter(d => d.status === col.key)
    return acc
  }, {})

  // "Mes livraisons du jour" (pour livreur)
  const today = new Date().toISOString().split('T')[0]
  const mesDuJour = isLivreur
    ? visibleDeliveries.filter(d => d.scheduled_date === today && d.status !== 'livree')
    : []

  // ── Helpers ───────────────────────────────────────
  const getMemberName = (userId) => {
    const m = workspaceMembers.find(u => u.user_id === userId)
    return m?.full_name || 'Membre'
  }

  const clientName = (delivery) => {
    const c = delivery.order?.customer
    if (!c) return 'Client inconnu'
    return `${c.first_name || ''} ${c.last_name || ''}`.trim()
  }

  // ── Status changes ────────────────────────────────
  const handleSimpleStatusChange = async (delivery, newStatus) => {
    try {
      const updates = { status: newStatus }
      if (newStatus === 'en_cours') updates.started_at = new Date().toISOString()
      if (newStatus === 'livree') updates.delivered_at = new Date().toISOString()
      await supabase.from('deliveries').update(updates).eq('id', delivery.id)
      // Si livree et order: mettre a jour order status
      if (newStatus === 'livree' && delivery.order?.id) {
        const order = delivery.order
        const fullyPaid = (order.remaining_amount || 0) <= 0
        await supabase.from('orders').update({ status: fullyPaid ? 'termine' : 'livre' }).eq('id', order.id)
      }
      toast.success('Statut mis a jour')
      loadDeliveries()
    } catch (err) {
      toast.error(err.message || 'Erreur mise a jour')
    }
  }

  // ── Plan modal ────────────────────────────────────
  const openPlanModal = (delivery) => {
    setPlanTarget(delivery)
    setPlanForm({
      scheduled_date: delivery.scheduled_date || '',
      time_slot: delivery.time_slot || '',
      assigned_to: delivery.assigned_to || (currentUserId || ''),
      delivery_fees: delivery.delivery_fees || ''
    })
    setShowPlanModal(true)
  }

  const handlePlan = async () => {
    if (!planForm.scheduled_date) {
      toast.error('La date est obligatoire')
      return
    }
    setPlanLoading(true)
    try {
      await supabase
        .from('deliveries')
        .update({
          status: 'planifiee',
          scheduled_date: planForm.scheduled_date,
          time_slot: planForm.time_slot || null,
          assigned_to: planForm.assigned_to || null,
          delivery_fees: parseFloat(planForm.delivery_fees) || null
        })
        .eq('id', planTarget.id)
      toast.success('Livraison planifiee !')
      setShowPlanModal(false)
      loadDeliveries()
    } catch (err) {
      toast.error(err.message || 'Erreur planification')
    } finally {
      setPlanLoading(false)
    }
  }

  // ── Livraison completee ───────────────────────────
  const openLivraisonModal = (delivery) => {
    setLivraisonTarget(delivery)
    const hasRemaining = (delivery.order?.remaining_amount || 0) > 0.01
    setOfferPayment(hasRemaining)
    setShowLivraisonModal(true)
  }

  const handleConfirmLivree = async (withPayment = false) => {
    setLivraisonLoading(true)
    try {
      const updates = { status: 'livree', delivered_at: new Date().toISOString() }
      await supabase.from('deliveries').update(updates).eq('id', livraisonTarget.id)
      if (livraisonTarget.order?.id) {
        const order = livraisonTarget.order
        const fullyPaid = !withPayment && (order.remaining_amount || 0) <= 0.01
        await supabase.from('orders').update({ status: fullyPaid ? 'termine' : 'livre' }).eq('id', order.id)
      }
      setShowLivraisonModal(false)
      if (withPayment && livraisonTarget.order?.id) {
        setPaymentOrderId(livraisonTarget.order.id)
        setPaymentOrderTotal(livraisonTarget.order.total_ttc || 0)
        setPaymentAmountPaid(livraisonTarget.order.amount_paid || 0)
        setShowPaymentModal(true)
      } else {
        toast.success('Livraison confirmee !')
      }
      loadDeliveries()
    } catch (err) {
      toast.error(err.message || 'Erreur confirmation livraison')
    } finally {
      setLivraisonLoading(false)
    }
  }

  // ── Payment a la livraison ────────────────────────
  const handlePayment = async (paymentData) => {
    if (!paymentOrderId) return
    setPaymentLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await createPayment(workspace.id, paymentOrderId, user.id, paymentData)
      toast.success('Paiement enregistre !')
      setShowPaymentModal(false)
      setPaymentOrderId(null)
      loadDeliveries()
    } catch (err) {
      toast.error(err.message || 'Erreur paiement')
    } finally {
      setPaymentLoading(false)
    }
  }

  // ── Cards ─────────────────────────────────────────
  const DeliveryCard = ({ delivery, compact = false }) => {
    const name = clientName(delivery)
    const order = delivery.order
    const typeBadge = DELIVERY_TYPE_BADGE[delivery.delivery_type] || DELIVERY_TYPE_BADGE.delivery
    const isOverdue = delivery.scheduled_date && delivery.scheduled_date < today && delivery.status !== 'livree'
    const assigneeName = delivery.assigned_to ? getMemberName(delivery.assigned_to) : null

    return (
      <div className={`bg-white rounded-xl p-4 shadow-sm border transition-all hover:shadow-md ${isOverdue ? 'border-orange-200' : 'border-gray-100'}`}>
        {/* Top */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-bold text-[#040741] truncate">{name}</p>
            {order?.order_number && (
              <button
                onClick={() => navigate(`/commandes/${order.id}`)}
                className="text-xs text-[#313ADF] hover:underline"
              >
                {order.order_number}
              </button>
            )}
          </div>
          <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${typeBadge.bg} ${typeBadge.text}`}>
            {typeBadge.label}
          </span>
        </div>

        {/* Adresse */}
        {delivery.delivery_address && (
          <p className="text-xs text-gray-500 mb-2 leading-snug">{delivery.delivery_address}</p>
        )}

        {/* Infos */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
          {delivery.scheduled_date && (
            <span className={`flex items-center gap-1 ${isOverdue ? 'text-orange-500 font-medium' : ''}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(delivery.scheduled_date).toLocaleDateString('fr-FR')}
              {isOverdue && ' ⚠'}
            </span>
          )}
          {delivery.time_slot && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {delivery.time_slot}
            </span>
          )}
          {assigneeName && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {assigneeName}
            </span>
          )}
          {order?.total_ttc && (
            <span className="font-medium text-[#040741]">{order.total_ttc.toFixed(0)} EUR</span>
          )}
        </div>

        {/* Paiement restant */}
        {(order?.remaining_amount || 0) > 0.01 && (
          <div className="mb-3 px-2.5 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
            <p className="text-xs text-orange-600 font-medium">
              Restant : {(order.remaining_amount || 0).toFixed(2)} EUR
            </p>
          </div>
        )}

        {/* Boutons action */}
        {!compact && (
          <div className="space-y-2 mt-2">
            {delivery.status === 'a_planifier' && (
              <button
                onClick={() => openPlanModal(delivery)}
                className="w-full py-2 bg-[#313ADF]/10 text-[#313ADF] rounded-lg text-xs font-semibold hover:bg-[#313ADF]/20 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Planifier
              </button>
            )}
            {delivery.status === 'planifiee' && (
              <button
                onClick={() => handleSimpleStatusChange(delivery, 'en_cours')}
                className="w-full py-2 bg-yellow-500 text-white rounded-lg text-xs font-semibold hover:bg-yellow-600 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Demarrer la livraison
              </button>
            )}
            {delivery.status === 'en_cours' && (
              <button
                onClick={() => openLivraisonModal(delivery)}
                className="w-full py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Confirmer la livraison
              </button>
            )}
            {delivery.status !== 'livree' && (order?.remaining_amount || 0) > 0.01 && (
              <button
                onClick={() => {
                  setPaymentOrderId(order.id)
                  setPaymentOrderTotal(order.total_ttc || 0)
                  setPaymentAmountPaid(order.amount_paid || 0)
                  setShowPaymentModal(true)
                }}
                className="w-full py-2 bg-[#040741]/5 text-[#040741] rounded-lg text-xs font-medium hover:bg-[#040741]/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Enregistrer un paiement
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-1">Livraisons & Retraits</h1>
          <p className="text-gray-500">
            {isLivreur ? 'Vos livraisons assignees' : `${visibleDeliveries.length} livraison(s) actives`}
          </p>
        </div>
      </div>

      {/* Mes livraisons du jour (livreur uniquement) */}
      {isLivreur && mesDuJour.length > 0 && (
        <div className="mb-8">
          <h2 className="text-base font-bold text-[#040741] mb-3 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Mes livraisons du jour ({mesDuJour.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mesDuJour.map(d => (
              <DeliveryCard key={d.id} delivery={d} />
            ))}
          </div>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {COLUMNS.map(col => {
          const colDeliveries = grouped[col.key] || []
          return (
            <div key={col.key}>
              {/* Header colonne */}
              <div className={`${col.header} rounded-xl py-3 px-4 mb-4 flex items-center justify-between`}>
                <h3 className={`font-bold ${col.text} flex items-center gap-2`}>
                  {col.key === 'a_planifier' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  )}
                  {col.key === 'planifiee' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                  {col.key === 'en_cours' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {col.key === 'livree' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {col.label}
                </h3>
                <span className={`text-sm font-bold ${col.text} opacity-70`}>{colDeliveries.length}</span>
              </div>

              {/* Cards */}
              <div className={`${col.bg} rounded-2xl p-3 min-h-[400px] space-y-3`}>
                {colDeliveries.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">Aucune</p>
                ) : (
                  colDeliveries.map(d => (
                    <DeliveryCard key={d.id} delivery={d} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal Planifier ──────────────────────────── */}
      {showPlanModal && planTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#040741]">Planifier la livraison</h3>
              <p className="text-sm text-gray-500 mt-1">{clientName(planTarget)}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Date *</label>
                <input
                  type="date"
                  value={planForm.scheduled_date}
                  onChange={(e) => setPlanForm({ ...planForm, scheduled_date: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Creneau horaire (optionnel)</label>
                <div className="relative">
                  <select
                    value={planForm.time_slot}
                    onChange={(e) => setPlanForm({ ...planForm, time_slot: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  >
                    <option value="">-- Aucun creneau --</option>
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
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
                <label className="block text-sm font-semibold text-[#040741] mb-2">Assigner a</label>
                <div className="relative">
                  <select
                    value={planForm.assigned_to}
                    onChange={(e) => setPlanForm({ ...planForm, assigned_to: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  >
                    <option value="">Non assigne</option>
                    {workspaceMembers.map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name || 'Membre'} ({m.role})
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
                <label className="block text-sm font-semibold text-[#040741] mb-2">Frais de livraison (optionnel)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={planForm.delivery_fees}
                  onChange={(e) => setPlanForm({ ...planForm, delivery_fees: e.target.value })}
                  placeholder="0.00 EUR"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowPlanModal(false)}
                className="px-6 py-2 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handlePlan}
                disabled={planLoading}
                className="px-6 py-2 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#4149e8] disabled:opacity-50 flex items-center gap-2"
              >
                {planLoading ? 'Enregistrement...' : 'Planifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmer livraison ─────────────────── */}
      {showLivraisonModal && livraisonTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-[#040741]">Confirmer la livraison</h3>
                <p className="text-sm text-gray-500">{clientName(livraisonTarget)}</p>
              </div>
            </div>

            {offerPayment && (
              <div className="mb-5 p-4 bg-orange-50 rounded-xl border border-orange-100">
                <p className="text-sm font-semibold text-orange-700 mb-1">Paiement restant</p>
                <p className="text-lg font-bold text-orange-600">
                  {(livraisonTarget.order?.remaining_amount || 0).toFixed(2)} EUR
                </p>
                <p className="text-xs text-orange-500 mt-1">Souhaitez-vous encaisser le solde maintenant ?</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {offerPayment && (
                <button
                  onClick={() => handleConfirmLivree(true)}
                  disabled={livraisonLoading}
                  className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Livree + Encaisser le solde
                </button>
              )}
              <button
                onClick={() => handleConfirmLivree(false)}
                disabled={livraisonLoading}
                className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                  offerPayment
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {offerPayment ? 'Livree sans paiement' : 'Confirmer la livraison'}
              </button>
              <button
                onClick={() => setShowLivraisonModal(false)}
                className="w-full py-2 border border-gray-200 rounded-xl font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PaymentModal ──────────────────────────────── */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setPaymentOrderId(null) }}
        onConfirm={handlePayment}
        orderTotal={paymentOrderTotal}
        amountPaid={paymentAmountPaid}
        loading={paymentLoading}
      />
    </div>
  )
}
