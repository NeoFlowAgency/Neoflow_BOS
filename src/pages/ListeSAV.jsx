import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSAVTickets, listCentNuitsAlerts } from '../services/savService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const STATUS_BADGES = {
  ouvert:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Ouvert' },
  en_cours: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'En cours' },
  resolu:   { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Résolu' },
  clos:     { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Clos' },
}

const TYPE_BADGES = {
  retour:      { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Retour' },
  reclamation: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Réclamation' },
  garantie:    { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Garantie' },
  avoir:       { bg: 'bg-teal-100',   text: 'text-teal-700',   label: 'Avoir' },
}

const PRIORITY_BADGES = {
  faible:  { dot: 'bg-gray-400',   label: 'Faible' },
  normale: { dot: 'bg-blue-400',   label: 'Normale' },
  urgente: { dot: 'bg-red-500',    label: 'Urgente' },
}

const STATUS_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'ouvert', label: 'Ouverts' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'resolu', label: 'Résolus' },
  { value: 'clos', label: 'Clos' },
]

const TYPE_FILTERS = [
  { value: '', label: 'Tous types' },
  { value: 'retour', label: 'Retour' },
  { value: 'reclamation', label: 'Réclamation' },
  { value: 'garantie', label: 'Garantie' },
  { value: 'avoir', label: 'Avoir' },
]

export default function ListeSAV() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [centNuits, setCentNuits] = useState([])
  const [centNuitsLoading, setCentNuitsLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (workspace?.id) {
      loadTickets()
      loadCentNuits()
    }
  }, [workspace?.id, statusFilter, typeFilter])

  const loadCentNuits = async () => {
    setCentNuitsLoading(true)
    try {
      const data = await listCentNuitsAlerts(workspace.id)
      setCentNuits(data)
    } catch {
      // silencieux
    } finally {
      setCentNuitsLoading(false)
    }
  }

  const loadTickets = async () => {
    setLoading(true)
    try {
      const data = await listSAVTickets(workspace.id, {
        status: statusFilter || undefined,
        type: typeFilter || undefined,
      })
      setTickets(data)
    } catch (err) {
      console.error('Erreur chargement SAV:', err)
      toast.error('Erreur lors du chargement des tickets SAV')
    } finally {
      setLoading(false)
    }
  }

  const filtered = tickets.filter(t => {
    if (!search) return true
    const term = search.toLowerCase()
    const client = `${t.customers?.first_name || ''} ${t.customers?.last_name || ''}`.toLowerCase()
    return (
      t.ticket_number?.toLowerCase().includes(term) ||
      t.description?.toLowerCase().includes(term) ||
      client.includes(term) ||
      t.orders?.order_number?.toLowerCase().includes(term)
    )
  })

  const stats = {
    ouverts: tickets.filter(t => t.status === 'ouvert').length,
    en_cours: tickets.filter(t => t.status === 'en_cours').length,
    urgents: tickets.filter(t => t.priority === 'urgente' && t.status !== 'clos').length,
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#040741]">Service Après-Vente</h1>
          <p className="text-sm text-gray-500 mt-0.5">Retours, réclamations, garanties et avoirs</p>
        </div>
        <button
          onClick={() => navigate('/sav/nouveau')}
          className="flex items-center gap-2 bg-[#313ADF] text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-[#040741] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau ticket
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ouverts', value: stats.ouverts, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
          { label: 'En cours', value: stats.en_cours, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
          { label: 'Urgents', value: stats.urgents, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Alerte 100 nuits */}
      {(centNuitsLoading || centNuits.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <h3 className="text-sm font-bold text-amber-800">Alerte Échange Confort — 100 nuits</h3>
            <span className="ml-auto text-xs text-amber-600 font-semibold">{centNuits.length} commande{centNuits.length > 1 ? 's' : ''}</span>
          </div>
          {centNuitsLoading ? (
            <p className="text-xs text-amber-600">Chargement…</p>
          ) : (
            <div className="space-y-2">
              {centNuits.map(order => {
                const client = order.customers
                  ? `${order.customers.first_name || ''} ${order.customers.last_name || ''}`.trim()
                  : 'Client inconnu'
                const daysLeft = 100 - order.days_since_delivery
                const urgent = daysLeft <= 10
                return (
                  <div key={order.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-amber-100 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#040741] truncate">{client}</p>
                      <p className="text-xs text-gray-500">{order.order_number} — livré il y a {order.days_since_delivery} j</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {daysLeft} j restants
                      </span>
                      <button
                        onClick={() => navigate('/sav/nouveau', { state: { orderId: order.id, customerId: order.customers?.id, type: 'garantie' } })}
                        className="text-xs text-[#313ADF] font-semibold hover:underline whitespace-nowrap"
                      >
                        Ouvrir SAV
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Filtres + Recherche */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Recherche */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Numéro, client, commande, description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>

          {/* Filtre statut */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] bg-white"
          >
            {STATUS_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>

          {/* Filtre type */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] bg-white"
          >
            {TYPE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
            <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium">Aucun ticket SAV</p>
            <button
              onClick={() => navigate('/sav/nouveau')}
              className="text-sm text-[#313ADF] font-semibold hover:underline"
            >
              Créer le premier ticket
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(ticket => {
              const statusBadge = STATUS_BADGES[ticket.status] || STATUS_BADGES.ouvert
              const typeBadge = TYPE_BADGES[ticket.type] || TYPE_BADGES.reclamation
              const priorityBadge = PRIORITY_BADGES[ticket.priority] || PRIORITY_BADGES.normale
              const clientName = ticket.customers
                ? `${ticket.customers.first_name || ''} ${ticket.customers.last_name || ''}`.trim()
                : 'Client non renseigné'

              return (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/sav/${ticket.id}`)}
                  className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  {/* Point priorité */}
                  <div className="flex-shrink-0 mt-1.5">
                    <span className={`block w-2.5 h-2.5 rounded-full ${priorityBadge.dot}`} title={`Priorité ${priorityBadge.label}`} />
                  </div>

                  {/* Infos principales */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[#040741]">{ticket.ticket_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${typeBadge.bg} ${typeBadge.text}`}>
                        {typeBadge.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge.bg} ${statusBadge.text}`}>
                        {statusBadge.label}
                      </span>
                    </div>

                    <p className="text-sm text-gray-700 truncate">{ticket.description}</p>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {clientName}
                      </span>
                      {ticket.orders?.order_number && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          {ticket.orders.order_number}
                        </span>
                      )}
                      <span>{new Date(ticket.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>

                  {/* Flèche */}
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
