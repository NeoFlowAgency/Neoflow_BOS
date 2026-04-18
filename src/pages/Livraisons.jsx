import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createPayment } from '../services/orderService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { sendPushToWorkspace } from '../lib/pushNotifications'
import { sendSms } from '../services/edgeFunctionService'
import PaymentModal from '../components/PaymentModal'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet'

// Fix Leaflet default icon broken with bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ─── Configs ────────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  '8h-10h', '9h-12h', '10h-12h', '12h-14h',
  '14h-16h', '14h-17h', '16h-18h', '17h-19h', '18h-20h',
  'Matin (8h-12h)', 'Après-midi (14h-18h)', 'Journée entière'
]

const COLUMNS = [
  { key: 'a_planifier', label: 'À planifier',  color: 'gray',   bg: 'bg-gray-50',    header: 'bg-gray-100',    text: 'text-gray-700' },
  { key: 'planifiee',   label: 'Planifiée',    color: 'blue',   bg: 'bg-blue-50',    header: 'bg-blue-100',    text: 'text-blue-700' },
  { key: 'en_cours',    label: 'En cours',     color: 'yellow', bg: 'bg-yellow-50',  header: 'bg-yellow-100',  text: 'text-yellow-700' },
  { key: 'livree',      label: 'Livrée',       color: 'green',  bg: 'bg-green-50',   header: 'bg-green-100',   text: 'text-green-700' },
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

  // Vue carte
  const [view, setView] = useState('kanban') // 'kanban' | 'map'
  const [livreurPositions, setLivreurPositions] = useState([])
  const mapPollRef = useRef(null)

  // Vue livreur : uniquement ses livraisons
  const isLivreur = role === 'livreur'
  const isManager = ['proprietaire', 'manager'].includes(role)

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

  // ── Polling positions livreurs (carte, toutes les 15s) ────────────────────
  useEffect(() => {
    if (!workspace?.id || !isManager) return
    if (view === 'map') {
      loadLivreurPositions()
      mapPollRef.current = setInterval(loadLivreurPositions, 15000)
    }
    return () => {
      if (mapPollRef.current) { clearInterval(mapPollRef.current); mapPollRef.current = null }
    }
  }, [view, workspace?.id, isManager])

  const loadLivreurPositions = async () => {
    try {
      const { data, error } = await supabase
        .from('livreur_positions')
        .select('user_id, lat, lng, accuracy, heading, speed, is_tracking, updated_at')
        .eq('workspace_id', workspace.id)

      if (error) throw error

      // Enrichir avec le nom du membre
      const membersById = {}
      workspaceMembers.forEach(m => { membersById[m.user_id] = m.full_name || 'Livreur' })

      const FIVE_MIN = 5 * 60 * 1000
      const now = Date.now()
      setLivreurPositions((data || []).map(p => ({
        ...p,
        name: membersById[p.user_id] || 'Livreur',
        isOnline: p.is_tracking && (now - new Date(p.updated_at).getTime()) < FIVE_MIN,
      })))
    } catch (err) {
      console.error('[Livraisons] Erreur positions:', err)
    }
  }

  const loadDeliveries = async () => {
    try {
      let query = supabase
        .from('deliveries')
        .select(`
          *,
          order:orders(
            id, order_number, total_ttc, remaining_amount, amount_paid,
            customer:customers(first_name, last_name, phone, address)
          ),
          invoice:invoices(
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
    ? visibleDeliveries.filter(d => d.scheduled_date?.startsWith(today) && d.status !== 'livree')
    : []

  // ── Helpers ───────────────────────────────────────
  const getMemberName = (userId) => {
    const m = workspaceMembers.find(u => u.user_id === userId)
    return m?.full_name || 'Membre'
  }

  const clientName = (delivery) => {
    const c = delivery.order?.customer || delivery.invoice?.customer
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

      // Notify managers/owners (non-blocking)
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      const clientName = livraisonTarget.order?.customers
        ? `${livraisonTarget.order.customers.first_name || ''} ${livraisonTarget.order.customers.last_name || ''}`.trim()
        : 'Client'
      sendPushToWorkspace(
        workspace.id,
        {
          title: 'Livraison confirmée',
          body: `Livraison pour ${clientName} marquée comme livrée`,
          tag: `livraison-${livraisonTarget.id}`,
          data: { url: '/livraisons' },
        },
        currentUser?.id,
      )

      // SMS post-livraison (non-bloquant)
      const customerPhone = livraisonTarget.order?.customer?.phone || livraisonTarget.invoice?.customer?.phone
      if (customerPhone && workspace.sms_api_key) {
        const prenom = livraisonTarget.order?.customer?.first_name || livraisonTarget.invoice?.customer?.first_name || ''
        sendSms(workspace.id, customerPhone, {
          template: 'post_delivery',
          variables: { prenom, lien_avis: workspace.google_review_link || '' },
        }).catch(() => {})
      }

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

  // ── SMS rappel J-1 ───────────────────────────────
  const [smsRappelLoading, setSmsRappelLoading] = useState(null)

  const handleSendRappelSms = async (delivery) => {
    const phone = delivery.order?.customer?.phone || delivery.invoice?.customer?.phone
    if (!phone) return toast.error('Aucun téléphone client pour cette livraison')
    if (!workspace.sms_api_key) return toast.error('Clé API SMS non configurée dans les paramètres')
    setSmsRappelLoading(delivery.id)
    try {
      const prenom = delivery.order?.customer?.first_name || delivery.invoice?.customer?.first_name || ''
      const date = delivery.scheduled_date
        ? new Date(delivery.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        : ''
      await sendSms(workspace.id, phone, {
        template: 'delivery_reminder',
        variables: { prenom, date, creneau: delivery.time_slot || '' },
      })
      toast.success('SMS de rappel envoyé !')
    } catch (err) {
      toast.error(err.message || 'Erreur envoi SMS')
    } finally {
      setSmsRappelLoading(null)
    }
  }

  // ── Payment a la livraison ────────────────────────
  const handlePayment = async (paymentData) => {
    if (!paymentOrderId) return
    setPaymentLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await createPayment(workspace.id, paymentOrderId, user.id, paymentData)

      // Auto-terminer la commande si entierement payee
      const newAmountPaid = (paymentAmountPaid || 0) + (paymentData.amount || 0)
      const isFullyPaid = newAmountPaid >= (paymentOrderTotal || 0) - 0.01
      if (isFullyPaid) {
        await supabase.from('orders').update({ status: 'termine' }).eq('id', paymentOrderId)
      }

      // Notify managers/owners of payment at delivery (non-blocking)
      const { data: { user: payUser } } = await supabase.auth.getUser()
      sendPushToWorkspace(
        workspace.id,
        {
          title: 'Paiement encaissé',
          body: `Paiement de ${paymentData.amount?.toFixed(2)} € enregistré à la livraison`,
          tag: `paiement-livraison-${paymentOrderId}`,
          data: { url: `/commandes/${paymentOrderId}` },
        },
        payUser?.id,
      )

      toast.success('Paiement enregistré !')
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
    const isOverdue = delivery.scheduled_date && delivery.scheduled_date.slice(0, 10) < today && delivery.status !== 'livree'
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
          {delivery.time_slot && (() => {
            // Support time_slot as string or JSON array
            let slots = []
            try {
              const parsed = JSON.parse(delivery.time_slot)
              slots = Array.isArray(parsed) ? parsed : [delivery.time_slot]
            } catch {
              slots = delivery.time_slot.includes(',')
                ? delivery.time_slot.split(',').map(s => s.trim())
                : [delivery.time_slot]
            }
            return slots.map((slot, i) => (
              <span key={i} className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {slot}
              </span>
            ))
          })()}
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
              <>
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
                {workspace.sms_api_key && (
                  <button
                    onClick={() => handleSendRappelSms(delivery)}
                    disabled={smsRappelLoading === delivery.id}
                    className="w-full py-2 bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold hover:bg-purple-200 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    {smsRappelLoading === delivery.id ? 'Envoi...' : 'Rappel SMS J-1'}
                  </button>
                )}
              </>
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
                className="w-full py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Encaisser ({(order.remaining_amount || 0).toFixed(2)} €)
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
        <div className="flex items-center gap-3 flex-wrap">
          {/* Bouton Ma journée pour livreurs */}
          {isLivreur && (
            <button
              onClick={() => navigate('/livraisons/ma-journee')}
              className="flex items-center gap-2 px-4 py-2 bg-[#313ADF] text-white rounded-xl font-semibold text-sm hover:bg-[#4149e8] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Vue mobile
            </button>
          )}
          {/* Onglets Kanban / Carte (manager uniquement) */}
          {isManager && (
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setView('kanban')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-white text-[#040741] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Kanban
              </button>
              <button
                onClick={() => setView('map')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${view === 'map' ? 'bg-white text-[#040741] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Carte
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Vue Carte ────────────────────────────────── */}
      {view === 'map' && isManager && (
        <div className="space-y-4">
          {/* Légende + compteurs livreurs */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Planifiée
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> En cours
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Livrée
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#313ADF] border-2 border-white shadow inline-block" /> Livreur en ligne
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> Livreur hors ligne
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualisation toutes les 15s
            </div>
          </div>

          {/* Tableau livreurs en ligne */}
          {livreurPositions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {livreurPositions.map(pos => (
                <div
                  key={pos.user_id}
                  className={`bg-white border rounded-xl px-3 py-2 flex items-center gap-2 ${pos.isOnline ? 'border-[#313ADF]/30' : 'border-gray-200 opacity-60'}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pos.isOnline ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#040741] truncate">{pos.name}</p>
                    <p className="text-xs text-gray-400">
                      {pos.isOnline
                        ? (pos.speed ? `${(pos.speed * 3.6).toFixed(0)} km/h` : 'En ligne')
                        : 'Hors ligne'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Carte Leaflet */}
          <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
            <MapContainer
              center={[46.603354, 1.888334]}
              zoom={6}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Pins adresses de livraison */}
              {deliveries
                .filter(d => d.delivery_address || d.order?.customer?.address)
                .filter(d => d.status !== 'annulee')
                .map(d => {
                  // On ne peut pas géocoder ici sans API — on affiche juste les livraisons avec coordonnées si disponibles
                  // Si delivery a lat/lng stockés, on les affiche, sinon on skip
                  if (!d.lat || !d.lng) return null
                  const colors = { planifiee: '#3b82f6', en_cours: '#eab308', livree: '#22c55e', a_planifier: '#6b7280' }
                  const color = colors[d.status] || '#6b7280'
                  return (
                    <CircleMarker
                      key={d.id}
                      center={[d.lat, d.lng]}
                      radius={9}
                      pathOptions={{ color: 'white', weight: 2, fillColor: color, fillOpacity: 0.9 }}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-semibold">{d.order?.order_number}</p>
                          <p>{d.delivery_address || d.order?.customer?.address}</p>
                          <p className="text-gray-500 mt-1">
                            {d.order?.customer?.first_name} {d.order?.customer?.last_name}
                          </p>
                          <p className="text-orange-600 font-medium">
                            Restant : {(d.order?.remaining_amount || 0).toFixed(2)} €
                          </p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  )
                })}

              {/* Pins livreurs */}
              {livreurPositions.map(pos => (
                <CircleMarker
                  key={pos.user_id}
                  center={[pos.lat, pos.lng]}
                  radius={12}
                  pathOptions={{
                    color: 'white',
                    weight: 3,
                    fillColor: pos.isOnline ? '#313ADF' : '#9ca3af',
                    fillOpacity: 0.95
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <p className="font-semibold">{pos.name}</p>
                      <p className={pos.isOnline ? 'text-green-600' : 'text-gray-400'}>
                        {pos.isOnline ? 'En ligne' : 'Hors ligne'}
                      </p>
                      {pos.speed && (
                        <p className="text-gray-500">{(pos.speed * 3.6).toFixed(0)} km/h</p>
                      )}
                      <p className="text-gray-400 text-xs mt-1">
                        MAJ : {new Date(pos.updated_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {livreurPositions.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-4">
              Aucun livreur n'a activé le tracking GPS. Les livreurs doivent ouvrir la vue mobile et activer le GPS.
            </p>
          )}
        </div>
      )}

      {/* Mes livraisons du jour (livreur uniquement) */}
      {view === 'kanban' && isLivreur && mesDuJour.length > 0 && (
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
      {view === 'kanban' && <div className="flex lg:grid lg:grid-cols-4 gap-4 lg:gap-5 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible">
        {COLUMNS.map(col => {
          const colDeliveries = grouped[col.key] || []
          return (
            <div key={col.key} className="min-w-[280px] lg:min-w-0 snap-start flex-shrink-0 lg:flex-shrink">
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
      </div>}

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
