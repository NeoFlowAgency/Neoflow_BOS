import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createSAVTicket } from '../services/savService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const TYPE_OPTIONS = [
  { value: 'retour',      label: 'Retour produit',          desc: 'Le client souhaite retourner un article' },
  { value: 'reclamation', label: 'Réclamation',              desc: 'Insatisfaction, litige ou problème qualité' },
  { value: 'garantie',    label: 'Garantie',                 desc: 'Produit défectueux sous garantie' },
  { value: 'avoir',       label: 'Avoir / Remboursement',    desc: "Émission d'un avoir commercial" },
]

const PRIORITY_OPTIONS = [
  { value: 'faible',  label: 'Faible',  color: 'text-gray-500' },
  { value: 'normale', label: 'Normale', color: 'text-[#313ADF]' },
  { value: 'urgente', label: 'Urgente', color: 'text-red-600' },
]

const MOTIF_OPTIONS = [
  { value: 'produit_manquant',   label: 'Produit manquant' },
  { value: 'produit_casse',      label: 'Produit cassé' },
  { value: 'defaut_fabrication', label: 'Défaut de fabrication' },
  { value: 'defaut_livraison',   label: 'Défaut de livraison' },
  { value: 'erreur_commande',    label: 'Erreur de commande' },
  { value: 'retour_client',      label: 'Retour client' },
  { value: 'autre',              label: 'Autre' },
]

export default function CreerSAV() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const preOrderId    = searchParams.get('order_id')
  const preCustomerId = searchParams.get('customer_id')

  const [type, setType]         = useState('reclamation')
  const [priority, setPriority] = useState('normale')
  const [note, setNote]         = useState('')

  // Commande
  const [orderSearch, setOrderSearch]     = useState('')
  const [orders, setOrders]               = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderDropdown, setOrderDropdown] = useState(false)

  // Client (auto-rempli depuis commande ou recherche manuelle)
  const [customerSearch, setCustomerSearch]       = useState('')
  const [customers, setCustomers]                 = useState([])
  const [selectedCustomer, setSelectedCustomer]   = useState(null)
  const [customerDropdown, setCustomerDropdown]   = useState(false)

  // Produits de la commande pour sélection SAV
  const [savItems, setSavItems] = useState([])

  const [saving, setSaving] = useState(false)

  // Pré-charger depuis URL
  useEffect(() => {
    if (!workspace?.id) return
    if (preOrderId) loadOrderById(preOrderId)
    else if (preCustomerId) loadCustomerById(preCustomerId)
  }, [workspace?.id, preOrderId, preCustomerId])

  const loadOrderById = async (id) => {
    const [orderRes, itemsRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, total_ttc, customers(id, first_name, last_name, phone)')
        .eq('id', id)
        .single(),
      supabase
        .from('order_items')
        .select('id, description, quantity, products(id, name)')
        .eq('order_id', id),
    ])
    if (orderRes.data) {
      setSelectedOrder(orderRes.data)
      if (orderRes.data.customers) setSelectedCustomer(orderRes.data.customers)
    }
    buildSavItems(itemsRes.data || [])
  }

  const loadCustomerById = async (id) => {
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone')
      .eq('id', id)
      .single()
    if (data) setSelectedCustomer(data)
  }

  const buildSavItems = (items) => {
    setSavItems(items.map(i => ({
      orderItemId: i.id,
      productId:   i.products?.id   || null,
      productName: i.products?.name || i.description || 'Produit',
      orderedQty:  i.quantity || 1,
      selectedQty: 1,
      motif:       'produit_casse',
      motifAutre:  '',
      selected:    false,
    })))
  }

  const handleOrderSelect = async (order) => {
    setSelectedOrder(order)
    setOrderSearch('')
    setOrderDropdown(false)
    if (order.customers) setSelectedCustomer(order.customers)
    const { data: items } = await supabase
      .from('order_items')
      .select('id, description, quantity, products(id, name)')
      .eq('order_id', order.id)
    buildSavItems(items || [])
  }

  const clearOrder = () => {
    setSelectedOrder(null)
    setSelectedCustomer(null)
    setSavItems([])
  }

  // Recherche commande
  useEffect(() => {
    if (orderSearch.length < 2) { setOrders([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, total_ttc, status, customers(id, first_name, last_name, phone)')
        .eq('workspace_id', workspace.id)
        .ilike('order_number', `%${orderSearch}%`)
        .limit(8)
      setOrders(data || [])
      setOrderDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [orderSearch, workspace?.id])

  // Recherche client (seulement si pas de commande)
  useEffect(() => {
    if (customerSearch.length < 2) { setCustomers([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, last_name, phone')
        .eq('workspace_id', workspace.id)
        .or(`first_name.ilike.%${customerSearch}%,last_name.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
        .limit(8)
      setCustomers(data || [])
      setCustomerDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch, workspace?.id])

  const toggleSavItem = (orderItemId) => {
    setSavItems(prev => prev.map(i =>
      i.orderItemId === orderItemId ? { ...i, selected: !i.selected } : i
    ))
  }

  const updateSavItem = (orderItemId, field, value) => {
    setSavItems(prev => prev.map(i =>
      i.orderItemId === orderItemId ? { ...i, [field]: value } : i
    ))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const selectedSavItems = savItems.filter(i => i.selected)
    if (selectedSavItems.length === 0 && !note.trim()) {
      toast.error('Sélectionnez au moins un produit ou ajoutez une note')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const itemsToSave = selectedSavItems.map(i => {
        const motifLabel = MOTIF_OPTIONS.find(m => m.value === i.motif)?.label || i.motif
        return {
          productId:   i.productId,
          description: i.motif === 'autre'
            ? `${i.productName} — ${i.motifAutre || 'Autre'}`
            : `${i.productName} — ${motifLabel}`,
          quantity:    i.selectedQty,
          condition:   'inconnu',
          action:      'en_attente',
        }
      })

      const autoDesc = selectedSavItems.length > 0
        ? selectedSavItems.map(i => {
            const ml = i.motif === 'autre'
              ? (i.motifAutre || 'Autre')
              : MOTIF_OPTIONS.find(m => m.value === i.motif)?.label || i.motif
            return `${i.productName} (x${i.selectedQty}) : ${ml}`
          }).join(', ')
        : 'Ticket SAV'

      const ticket = await createSAVTicket(workspace.id, user.id, {
        type,
        priority,
        description: note.trim() || autoDesc,
        customerId:  selectedCustomer?.id || null,
        orderId:     selectedOrder?.id    || null,
        items:       itemsToSave,
      })

      toast.success(`Ticket ${ticket.ticket_number} créé`)
      navigate(`/sav/${ticket.id}`)
    } catch (err) {
      console.error('Erreur création SAV:', err)
      toast.error('Erreur lors de la création du ticket')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
  const selectedCount = savItems.filter(i => i.selected).length

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/sav')}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#040741]">Nouveau ticket SAV</h1>
          <p className="text-sm text-gray-500">Commencez par rechercher la commande concernée</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── 1. Commande (point de départ) ────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide mb-3">
            Commande concernée
          </h2>

          {selectedOrder ? (
            <div className="flex items-center justify-between bg-[#313ADF]/5 border border-[#313ADF]/20 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-bold text-[#040741]">{selectedOrder.order_number}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {selectedCustomer && (
                    <p className="text-xs text-gray-500">
                      {selectedCustomer.first_name} {selectedCustomer.last_name}
                    </p>
                  )}
                  {selectedOrder.total_ttc != null && (
                    <p className="text-xs text-gray-400">· {Number(selectedOrder.total_ttc).toFixed(0)} €</p>
                  )}
                </div>
              </div>
              <button type="button" onClick={clearOrder} className="text-gray-400 hover:text-red-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                placeholder="Numéro de commande (ex : CMD-0042)…"
                value={orderSearch}
                onChange={e => setOrderSearch(e.target.value)}
                onFocus={() => orders.length > 0 && setOrderDropdown(true)}
                onBlur={() => setTimeout(() => setOrderDropdown(false), 200)}
                className={inputClass}
                autoFocus
              />
              {orderDropdown && orders.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {orders.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onMouseDown={() => handleOrderSelect(o)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <p className="text-sm font-semibold text-gray-800">{o.order_number}</p>
                      <p className="text-xs text-gray-400">
                        {o.customers ? `${o.customers.first_name} ${o.customers.last_name} · ` : ''}
                        {Number(o.total_ttc || 0).toFixed(0)} €
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Client manuel si pas de commande */}
          {!selectedOrder && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">Ou directement un client (sans commande)</p>
              {selectedCustomer ? (
                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                  <p className="text-sm font-medium text-gray-800">
                    {selectedCustomer.first_name} {selectedCustomer.last_name}
                  </p>
                  <button type="button" onClick={() => setSelectedCustomer(null)} className="text-gray-400 hover:text-red-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Nom, prénom ou téléphone…"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    onFocus={() => customers.length > 0 && setCustomerDropdown(true)}
                    onBlur={() => setTimeout(() => setCustomerDropdown(false), 200)}
                    className={inputClass}
                  />
                  {customerDropdown && customers.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {customers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerDropdown(false) }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-800">{c.first_name} {c.last_name}</p>
                          {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 2. Produits en SAV (affiché si commande sélectionnée) ── */}
        {selectedOrder && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide">
                Produits concernés
              </h2>
              {selectedCount > 0 && (
                <span className="text-xs bg-[#313ADF]/10 text-[#313ADF] font-semibold px-2.5 py-1 rounded-full">
                  {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {savItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucun produit trouvé dans cette commande</p>
            ) : (
              <div className="space-y-2">
                {savItems.map(item => (
                  <div
                    key={item.orderItemId}
                    className={`border-2 rounded-xl p-3 transition-all ${
                      item.selected ? 'border-[#313ADF] bg-[#313ADF]/5' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Ligne principale : checkbox + nom */}
                    <div
                      className="flex items-center gap-3 cursor-pointer"
                      onClick={() => toggleSavItem(item.orderItemId)}
                    >
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        item.selected ? 'bg-[#313ADF] border-[#313ADF]' : 'border-gray-300'
                      }`}>
                        {item.selected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.productName}</p>
                        <p className="text-xs text-gray-400">Qté commandée : {item.orderedQty}</p>
                      </div>
                    </div>

                    {/* Options (quantité + motif) visibles si sélectionné */}
                    {item.selected && (
                      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
                        {/* Quantité */}
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Quantité concernée</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); updateSavItem(item.orderItemId, 'selectedQty', Math.max(1, item.selectedQty - 1)) }}
                              className="w-8 h-8 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200 flex items-center justify-center font-bold transition-colors"
                            >−</button>
                            <span className="text-sm font-bold text-[#040741] w-5 text-center">{item.selectedQty}</span>
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); updateSavItem(item.orderItemId, 'selectedQty', Math.min(item.orderedQty, item.selectedQty + 1)) }}
                              className="w-8 h-8 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200 flex items-center justify-center font-bold transition-colors"
                            >+</button>
                            <span className="text-xs text-gray-400">/ {item.orderedQty}</span>
                          </div>
                        </div>

                        {/* Motif */}
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Motif</label>
                          <select
                            value={item.motif}
                            onChange={e => { e.stopPropagation(); updateSavItem(item.orderItemId, 'motif', e.target.value) }}
                            onClick={e => e.stopPropagation()}
                            className={`${inputClass} py-2`}
                          >
                            {MOTIF_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Précision si "Autre" */}
                        {item.motif === 'autre' && (
                          <div className="col-span-2">
                            <input
                              type="text"
                              placeholder="Précisez le motif…"
                              value={item.motifAutre}
                              onChange={e => updateSavItem(item.orderItemId, 'motifAutre', e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className={inputClass}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 3. Type de demande ────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide mb-3">Type de demande</h2>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  type === opt.value ? 'border-[#313ADF] bg-[#313ADF]/5' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className={`text-sm font-semibold ${type === opt.value ? 'text-[#313ADF]' : 'text-gray-700'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 leading-snug">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── 4. Priorité ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide mb-3">Priorité</h2>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(opt.value)}
                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  priority === opt.value
                    ? 'border-[#313ADF] bg-[#313ADF]/5 text-[#313ADF]'
                    : `border-gray-200 hover:border-gray-300 ${opt.color}`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 5. Note (optionnelle) ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide mb-1">
            Note <span className="text-gray-400 font-normal normal-case">(optionnel)</span>
          </h2>
          <p className="text-xs text-gray-400 mb-3">Contexte supplémentaire, circonstances, photos disponibles…</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Ex : le client a reçu le colis abîmé, il a des photos…"
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* ── Actions ──────────────────────────────────────────── */}
        <div className="flex gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate('/sav')}
            className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-[#313ADF] text-white py-3 rounded-xl font-semibold hover:bg-[#040741] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving
              ? 'Création…'
              : selectedCount > 0
                ? `Créer le ticket (${selectedCount} produit${selectedCount > 1 ? 's' : ''})`
                : 'Créer le ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
