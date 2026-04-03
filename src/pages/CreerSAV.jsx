import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createSAVTicket } from '../services/savService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const TYPE_OPTIONS = [
  { value: 'retour',      label: 'Retour produit',  desc: 'Le client souhaite retourner un article' },
  { value: 'reclamation', label: 'Réclamation',      desc: 'Insatisfaction, litige ou problème qualité' },
  { value: 'garantie',    label: 'Garantie',         desc: 'Produit défectueux sous garantie' },
  { value: 'avoir',       label: 'Avoir / Remboursement', desc: 'Émission d\'un avoir commercial' },
]

const PRIORITY_OPTIONS = [
  { value: 'faible',  label: 'Faible',   color: 'text-gray-500' },
  { value: 'normale', label: 'Normale',  color: 'text-blue-600' },
  { value: 'urgente', label: 'Urgente',  color: 'text-red-600' },
]

const CONDITION_OPTIONS = [
  { value: 'neuf',         label: 'Neuf / Non utilisé' },
  { value: 'bon',          label: 'Bon état' },
  { value: 'abime',        label: 'Abîmé' },
  { value: 'hors_service', label: 'Hors service' },
  { value: 'inconnu',      label: 'Non vérifié' },
]

const ACTION_OPTIONS = [
  { value: 'en_attente',   label: 'À définir' },
  { value: 'remboursement', label: 'Remboursement' },
  { value: 'echange',      label: 'Échange' },
  { value: 'reparation',   label: 'Réparation' },
  { value: 'rejet',        label: 'Rejet' },
]

export default function CreerSAV() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { workspace } = useWorkspace()
  const toast = useToast()

  // Pré-remplissage depuis l'URL (?order_id=xxx&customer_id=xxx)
  const preOrderId    = searchParams.get('order_id')
  const preCustomerId = searchParams.get('customer_id')

  const [type, setType]         = useState('reclamation')
  const [priority, setPriority] = useState('normale')
  const [description, setDescription] = useState('')

  // Client
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerDropdown, setCustomerDropdown] = useState(false)

  // Commande liée
  const [orderSearch, setOrderSearch] = useState('')
  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderDropdown, setOrderDropdown] = useState(false)

  // Articles
  const [items, setItems] = useState([])

  const [saving, setSaving] = useState(false)

  // Pré-charger depuis URL
  useEffect(() => {
    if (!workspace?.id) return
    if (preOrderId) loadOrderById(preOrderId)
    if (preCustomerId) loadCustomerById(preCustomerId)
  }, [workspace?.id, preOrderId, preCustomerId])

  const loadOrderById = async (id) => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, total_ttc, customers(id, first_name, last_name, phone)')
      .eq('id', id)
      .single()
    if (data) {
      setSelectedOrder(data)
      if (data.customers && !preCustomerId) setSelectedCustomer(data.customers)
    }
  }

  const loadCustomerById = async (id) => {
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone')
      .eq('id', id)
      .single()
    if (data) setSelectedCustomer(data)
  }

  // Recherche client
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

  // Recherche commande
  useEffect(() => {
    if (orderSearch.length < 2) { setOrders([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, total_ttc, status')
        .eq('workspace_id', workspace.id)
        .ilike('order_number', `%${orderSearch}%`)
        .limit(8)
      setOrders(data || [])
      setOrderDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [orderSearch, workspace?.id])

  // Gestion articles
  const addItem = () => {
    setItems(prev => [...prev, {
      id: Date.now(),
      productId: null,
      description: '',
      quantity: 1,
      condition: 'inconnu',
      action: 'en_attente',
    }])
  }

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id))

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!description.trim()) { toast.error('La description est obligatoire'); return }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ticket = await createSAVTicket(workspace.id, user.id, {
        type,
        priority,
        description: description.trim(),
        customerId: selectedCustomer?.id || null,
        orderId: selectedOrder?.id || null,
        items: items.filter(i => i.description.trim() || i.productId),
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

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
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
          <p className="text-sm text-gray-500">Retour, réclamation, garantie ou avoir</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Type de ticket */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide mb-3">Type de demande</h2>
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  type === opt.value
                    ? 'border-[#313ADF] bg-[#313ADF]/5'
                    : 'border-gray-200 hover:border-gray-300'
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

        {/* Priorité */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide mb-3">Priorité</h2>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(opt.value)}
                className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
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

        {/* Client et commande */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide">Client & Commande</h2>

          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Client</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-[#040741]">
                    {selectedCustomer.first_name} {selectedCustomer.last_name}
                  </p>
                  {selectedCustomer.phone && (
                    <p className="text-xs text-gray-500">{selectedCustomer.phone}</p>
                  )}
                </div>
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
                  placeholder="Rechercher un client (nom, prénom, téléphone)…"
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

          {/* Commande liée */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Commande associée <span className="text-gray-400 font-normal">(optionnel)</span></label>
            {selectedOrder ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-[#040741]">{selectedOrder.order_number}</p>
                  {selectedOrder.total_ttc && (
                    <p className="text-xs text-gray-500">{selectedOrder.total_ttc} €</p>
                  )}
                </div>
                <button type="button" onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-red-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher une commande (numéro)…"
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                  onFocus={() => orders.length > 0 && setOrderDropdown(true)}
                  onBlur={() => setTimeout(() => setOrderDropdown(false), 200)}
                  className={inputClass}
                />
                {orderDropdown && orders.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {orders.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        onMouseDown={() => { setSelectedOrder(o); setOrderSearch(''); setOrderDropdown(false) }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-800">{o.order_number}</p>
                        <p className="text-xs text-gray-400">{o.total_ttc} € · {o.status}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide mb-3">Description du problème *</h2>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            required
            placeholder="Décrivez le problème, la demande du client, les circonstances…"
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Articles concernés */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#040741] uppercase tracking-wide">Articles concernés <span className="text-gray-400 font-normal normal-case">(optionnel)</span></h2>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 text-sm text-[#313ADF] font-semibold hover:bg-[#313ADF]/5 px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter un article
            </button>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun article ajouté</p>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Article {idx + 1}</span>
                    <button type="button" onClick={() => removeItem(item.id)} className="text-gray-400 hover:text-red-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Description de l'article…"
                    value={item.description}
                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                    className={inputClass}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Qté</label>
                      <input
                        type="number" min="1"
                        value={item.quantity}
                        onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">État</label>
                      <select
                        value={item.condition}
                        onChange={e => updateItem(item.id, 'condition', e.target.value)}
                        className={`${inputClass} py-2`}
                      >
                        {CONDITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Action</label>
                      <select
                        value={item.action}
                        onChange={e => updateItem(item.id, 'action', e.target.value)}
                        className={`${inputClass} py-2`}
                      >
                        {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
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
            disabled={saving || !description.trim()}
            className="flex-1 bg-[#313ADF] text-white py-3 rounded-xl font-semibold hover:bg-[#040741] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Création…' : 'Créer le ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
