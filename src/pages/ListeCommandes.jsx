import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { listOrders, updateOrderStatus, listOrdersReadyToDeliver } from '../services/orderService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { downloadCSV } from '../lib/csvExport'

const STATUS_BADGES = {
  brouillon: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
  confirme: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Confirmé' },
  en_preparation: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'En préparation' },
  en_livraison: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'En livraison' },
  en_cours: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'En cours' },
  livre: { bg: 'bg-purple-100', text: 'text-purple-600', label: 'Livré' },
  termine: { bg: 'bg-green-100', text: 'text-green-600', label: 'Terminé' },
  annule: { bg: 'bg-red-100', text: 'text-red-600', label: 'Annulé' }
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

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'pret_a_livrer', label: 'Prêt à livrer', special: true },
  { value: 'confirme', label: 'Confirmé' },
  { value: 'en_preparation', label: 'En préparation' },
  { value: 'en_livraison', label: 'En livraison' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'livre', label: 'Livré' },
  { value: 'termine', label: 'Terminé' },
  { value: 'annule', label: 'Annulé' }
]

export default function ListeCommandes() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusDropdown, setStatusDropdown] = useState(null) // order.id with open dropdown
  const [statusUpdating, setStatusUpdating] = useState(null) // order.id being updated
  const dropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setStatusDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!workspace?.id) return
    let cancelled = false
    setLoading(true)
    const fetch = async () => {
      try {
        let data
        if (statusFilter === 'pret_a_livrer') {
          data = await listOrdersReadyToDeliver(workspace.id)
        } else {
          const filters = {}
          if (statusFilter) filters.status = statusFilter
          data = await listOrders(workspace.id, filters)
        }
        if (!cancelled) setOrders(data)
      } catch (err) {
        if (!cancelled) toast.error('Erreur lors du chargement des commandes')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetch()
    return () => { cancelled = true }
  }, [workspace?.id, statusFilter])

  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    const clientName = `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.toLowerCase()
    return (
      order.order_number?.toLowerCase().includes(term) ||
      clientName.includes(term) ||
      order.customer?.phone?.includes(term)
    )
  })

  const handleQuickStatusChange = async (e, orderId, newStatus) => {
    e.stopPropagation()
    setStatusDropdown(null)
    setStatusUpdating(orderId)
    try {
      await updateOrderStatus(orderId, newStatus)
      toast.success(`Statut mis à jour : ${STATUS_BADGES[newStatus]?.label || newStatus}`)
      loadOrders()
    } catch (err) {
      toast.error(err.message || 'Erreur mise à jour statut')
    } finally {
      setStatusUpdating(null)
    }
  }

  const getStatusBadge = (status) => {
    const badge = STATUS_BADGES[status] || STATUS_BADGES.brouillon
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  const getPaymentBadge = (order) => {
    const paid = order.amount_paid || 0
    const total = order.total_ttc || 0
    if (total <= 0) return null

    const ratio = paid / total
    if (ratio >= 1) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Payé</span>
    } else if (ratio > 0) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Partiel</span>
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Non payé</span>
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Commandes</h1>
          <p className="text-gray-500">{filteredOrders.length} commande{filteredOrders.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadCSV('commandes', ['N° Commande', 'Client', 'Statut', 'Total TTC', 'Paiement', 'Date'], filteredOrders.map(o => [
              o.order_number || '',
              [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || '',
              STATUS_BADGES[o.status]?.label || o.status || '',
              o.total_ttc != null ? Number(o.total_ttc).toFixed(2) : '',
              o.amount_paid != null ? Number(o.amount_paid).toFixed(2) : '',
              o.created_at ? new Date(o.created_at).toLocaleDateString('fr-FR') : ''
            ]))}
            className="border border-gray-200 bg-white text-gray-600 px-4 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
          <button
            onClick={() => navigate('/commandes/nouvelle')}
            className="flex items-center gap-2 bg-[#313ADF] text-white px-5 py-3 rounded-xl font-semibold hover:bg-[#4149e8] transition-colors shadow-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle commande
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Recherche */}
        <div className="relative flex-1">
          <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par numero, client, telephone..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] shadow-sm"
          />
        </div>

        {/* Filtre statut */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                statusFilter === f.value
                  ? f.special ? 'bg-green-600 text-white shadow-md' : 'bg-[#313ADF] text-white shadow-md'
                  : f.special ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-500 mb-4">{searchTerm || statusFilter ? 'Aucune commande correspondante' : 'Aucune commande pour le moment'}</p>
          <button
            onClick={() => navigate('/commandes/nouvelle')}
            className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold hover:bg-[#4149e8] transition-colors"
          >
            Créer une commande
          </button>
        </div>
      ) : (
        <>
          {/* Vue Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-4 px-6 font-semibold text-[#040741] text-sm">N°</th>
                  <th className="text-left py-4 px-4 font-semibold text-[#040741] text-sm">Client</th>
                  <th className="text-left py-4 px-4 font-semibold text-[#040741] text-sm">Date</th>
                  <th className="text-right py-4 px-4 font-semibold text-[#040741] text-sm">Total TTC</th>
                  <th className="text-right py-4 px-4 font-semibold text-[#040741] text-sm">Payé</th>
                  <th className="text-right py-4 px-4 font-semibold text-[#040741] text-sm">Reste dû</th>
                  <th className="text-center py-4 px-4 font-semibold text-[#040741] text-sm">Statut</th>
                  <th className="text-center py-4 px-4 font-semibold text-[#040741] text-sm">Règlement</th>
                  <th className="py-4 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/commandes/${order.id}`)}
                    className="border-b border-gray-50 hover:bg-[#313ADF]/5 cursor-pointer transition-colors"
                  >
                    <td className="py-4 px-6">
                      <span className="font-semibold text-[#313ADF] text-sm">{order.order_number}</span>
                      {order.order_type === 'quick_sale' && (
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Rapide</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {order.customer ? (
                        <div>
                          <p className="font-medium text-[#040741] text-sm">{order.customer.first_name} {order.customer.last_name}</p>
                          <p className="text-xs text-gray-400">{order.customer.phone}</p>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-gray-600 text-sm">
                      {new Date(order.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-4 px-4 text-right font-semibold text-[#040741] text-sm">
                      {(order.total_ttc || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €
                    </td>
                    <td className="py-4 px-4 text-right text-green-600 text-sm font-medium">
                      {(order.amount_paid || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €
                    </td>
                    <td className="py-4 px-4 text-right text-sm font-medium">
                      <span className={(order.remaining_amount || 0) > 0 ? 'text-orange-600' : 'text-gray-400'}>
                        {(order.remaining_amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center" onClick={e => e.stopPropagation()}>
                      <div className="relative inline-block" ref={statusDropdown === order.id ? dropdownRef : null}>
                        <button
                          onClick={e => { e.stopPropagation(); setStatusDropdown(statusDropdown === order.id ? null : order.id) }}
                          disabled={statusUpdating === order.id || (STATUS_FLOW[order.status]?.length === 0)}
                          className="flex items-center gap-1 group"
                        >
                          {getStatusBadge(order.status)}
                          {STATUS_FLOW[order.status]?.length > 0 && (
                            <svg className="w-3 h-3 text-gray-400 group-hover:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                        {statusDropdown === order.id && STATUS_FLOW[order.status]?.length > 0 && (
                          <div className="absolute z-50 top-full mt-1 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                            {STATUS_FLOW[order.status].map(s => (
                              <button
                                key={s}
                                onClick={e => handleQuickStatusChange(e, order.id, s)}
                                className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${s === 'annule' ? 'text-red-500' : 'text-[#040741]'}`}
                              >
                                {STATUS_BADGES[s]?.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">{getPaymentBadge(order)}</td>
                    <td className="py-4 px-4 text-center">
                      <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vue Mobile */}
          <div className="md:hidden space-y-3">
            {filteredOrders.map(order => (
              <div
                key={order.id}
                className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <button onClick={() => navigate(`/commandes/${order.id}`)} className="flex-1 text-left">
                    <span className="font-semibold text-[#313ADF] text-sm">{order.order_number}</span>
                    {order.order_type === 'quick_sale' && (
                      <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Rapide</span>
                    )}
                  </button>
                  <div className="relative" ref={statusDropdown === order.id + '-mobile' ? dropdownRef : null}>
                    <button
                      onClick={e => { e.stopPropagation(); setStatusDropdown(statusDropdown === order.id + '-mobile' ? null : order.id + '-mobile') }}
                      disabled={STATUS_FLOW[order.status]?.length === 0}
                      className="flex items-center gap-1"
                    >
                      {getStatusBadge(order.status)}
                      {STATUS_FLOW[order.status]?.length > 0 && (
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                    {statusDropdown === order.id + '-mobile' && STATUS_FLOW[order.status]?.length > 0 && (
                      <div className="absolute z-50 top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
                        {STATUS_FLOW[order.status].map(s => (
                          <button
                            key={s}
                            onClick={e => handleQuickStatusChange(e, order.id, s)}
                            className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${s === 'annule' ? 'text-red-500' : 'text-[#040741]'}`}
                          >
                            {STATUS_BADGES[s]?.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => navigate(`/commandes/${order.id}`)} className="w-full text-left">
                  {order.customer && (
                    <p className="text-sm text-[#040741] font-medium">{order.customer.first_name} {order.customer.last_name}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('fr-FR')}</span>
                    <div className="flex items-center gap-2">
                      {getPaymentBadge(order)}
                      <span className="font-bold text-[#040741]">{(order.total_ttc || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €</span>
                    </div>
                  </div>
                  {(order.remaining_amount || 0) > 0 && (
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-[#313ADF]"
                        style={{ width: `${Math.min(100, ((order.amount_paid || 0) / (order.total_ttc || 1)) * 100)}%` }}
                      />
                    </div>
                  )}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
