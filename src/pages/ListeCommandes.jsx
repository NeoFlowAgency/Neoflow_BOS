import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listOrders } from '../services/orderService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const STATUS_BADGES = {
  brouillon: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
  confirme: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Confirme' },
  en_cours: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'En cours' },
  livre: { bg: 'bg-purple-100', text: 'text-purple-600', label: 'Livre' },
  termine: { bg: 'bg-green-100', text: 'text-green-600', label: 'Termine' },
  annule: { bg: 'bg-red-100', text: 'text-red-600', label: 'Annule' }
}

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'confirme', label: 'Confirme' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'livre', label: 'Livre' },
  { value: 'termine', label: 'Termine' },
  { value: 'annule', label: 'Annule' }
]

export default function ListeCommandes() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (workspace?.id) loadOrders()
  }, [workspace?.id, statusFilter])

  const loadOrders = async () => {
    setLoading(true)
    try {
      const filters = {}
      if (statusFilter) filters.status = statusFilter
      const data = await listOrders(workspace.id, filters)
      setOrders(data)
    } catch (err) {
      console.error('Erreur chargement commandes:', err)
      toast.error('Erreur lors du chargement des commandes')
    } finally {
      setLoading(false)
    }
  }

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
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Paye</span>
    } else if (ratio > 0) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Partiel</span>
    }
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Non paye</span>
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Commandes</h1>
          <p className="text-gray-500">{filteredOrders.length} commande{filteredOrders.length !== 1 ? 's' : ''}</p>
        </div>
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
                  ? 'bg-[#313ADF] text-white shadow-md'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
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
            Creer une commande
          </button>
        </div>
      ) : (
        <>
          {/* Vue Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-4 px-6 font-semibold text-[#040741] text-sm">Numero</th>
                  <th className="text-left py-4 px-4 font-semibold text-[#040741] text-sm">Client</th>
                  <th className="text-left py-4 px-4 font-semibold text-[#040741] text-sm">Date</th>
                  <th className="text-right py-4 px-4 font-semibold text-[#040741] text-sm">Total TTC</th>
                  <th className="text-right py-4 px-4 font-semibold text-[#040741] text-sm">Paye</th>
                  <th className="text-right py-4 px-4 font-semibold text-[#040741] text-sm">Reste</th>
                  <th className="text-center py-4 px-4 font-semibold text-[#040741] text-sm">Statut</th>
                  <th className="text-center py-4 px-4 font-semibold text-[#040741] text-sm">Paiement</th>
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
                      {(order.total_ttc || 0).toFixed(2)} EUR
                    </td>
                    <td className="py-4 px-4 text-right text-green-600 text-sm font-medium">
                      {(order.amount_paid || 0).toFixed(2)} EUR
                    </td>
                    <td className="py-4 px-4 text-right text-sm font-medium">
                      <span className={(order.remaining_amount || 0) > 0 ? 'text-orange-600' : 'text-gray-400'}>
                        {(order.remaining_amount || 0).toFixed(2)} EUR
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">{getStatusBadge(order.status)}</td>
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
              <button
                key={order.id}
                onClick={() => navigate(`/commandes/${order.id}`)}
                className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-semibold text-[#313ADF] text-sm">{order.order_number}</span>
                    {order.order_type === 'quick_sale' && (
                      <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Rapide</span>
                    )}
                  </div>
                  {getStatusBadge(order.status)}
                </div>
                {order.customer && (
                  <p className="text-sm text-[#040741] font-medium">{order.customer.first_name} {order.customer.last_name}</p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString('fr-FR')}</span>
                  <div className="flex items-center gap-2">
                    {getPaymentBadge(order)}
                    <span className="font-bold text-[#040741]">{(order.total_ttc || 0).toFixed(2)} EUR</span>
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
            ))}
          </div>
        </>
      )}
    </div>
  )
}
