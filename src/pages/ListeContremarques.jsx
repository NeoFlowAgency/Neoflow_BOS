import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listContremarques, updateContremarqueStatus } from '../services/contremarqueService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'

const STATUS_FILTERS = [
  { value: '', label: 'Toutes' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'commandee', label: 'Commandées' },
  { value: 'recue', label: 'Reçues' },
  { value: 'allouee', label: 'Allouées' },
  { value: 'livree', label: 'Livrées' },
]

const STATUS_BADGES = {
  en_attente:  { bg: 'bg-gray-100',   text: 'text-gray-700',   label: 'En attente' },
  commandee:   { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'Commandée' },
  recue:       { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Reçue' },
  allouee:     { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Allouée' },
  livree:      { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Livrée' },
}

const TRANSITIONS = {
  en_attente: ['commandee'],
  commandee:  ['recue'],
  recue:      ['allouee'],
  allouee:    ['livree'],
  livree:     [],
}

export default function ListeContremarques() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()
  const toast = useToast()

  const [contremarques, setContremarques] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('en_attente')
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    if (workspace?.id) load()
  }, [workspace?.id, statusFilter])

  const load = async () => {
    setLoading(true)
    try {
      const data = await listContremarques(workspace.id, {
        status: statusFilter || undefined,
      })
      setContremarques(data)
    } catch (err) {
      toast.error('Erreur chargement contremarques')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (contremarqueId, newStatus) => {
    setUpdatingId(contremarqueId)
    try {
      await updateContremarqueStatus(contremarqueId, newStatus)
      toast.success('Statut mis à jour')
      load()
    } catch (err) {
      toast.error(err.message || 'Erreur mise à jour')
    } finally {
      setUpdatingId(null)
    }
  }

  const grouped = contremarques.reduce((acc, cm) => {
    const key = cm.supplier?.name || 'Sans fournisseur'
    if (!acc[key]) acc[key] = []
    acc[key].push(cm)
    return acc
  }, {})

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#040741]">Contremarques</h1>
          <p className="text-sm text-gray-500 mt-1">
            Commandes fournisseurs en attente de réception
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-6">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'bg-[#313ADF] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#313ADF] border-t-transparent" />
        </div>
      ) : contremarques.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg font-medium">Aucune contremarque</p>
          <p className="text-sm mt-1">
            Créez des contremarques depuis l'aperçu d'une commande
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([supplierName, items]) => (
            <div key={supplierName} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">{supplierName}</h2>
                <span className="text-sm text-gray-500">{items.length} contremarque{items.length > 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {items.map(cm => {
                  const st = STATUS_BADGES[cm.status]
                  const nextStatuses = TRANSITIONS[cm.status] || []
                  const customer = cm.order?.customer
                  const customerName = customer
                    ? `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
                    : '—'

                  return (
                    <div key={cm.id} className="px-6 py-4 flex items-center gap-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${st?.bg} ${st?.text}`}>
                        {st?.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {cm.order_item?.product?.name || 'Article'}
                          {cm.order_item?.variant?.size
                            ? ` — ${cm.order_item.variant.size}${cm.order_item.variant.comfort ? ' ' + cm.order_item.variant.comfort : ''}`
                            : ''}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <button
                            onClick={() => navigate(`/commandes/${cm.order_id}`)}
                            className="text-xs text-[#313ADF] hover:underline"
                          >
                            {cm.order?.order_number || 'Commande'}
                          </button>
                          <span className="text-xs text-gray-400">{customerName}</span>
                          {cm.expected_date && (
                            <span className="text-xs text-gray-400">
                              Prévu : {new Date(cm.expected_date).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                        {cm.notes && (
                          <p className="text-xs text-gray-400 italic mt-0.5">{cm.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {nextStatuses.map(ns => (
                          <button
                            key={ns}
                            onClick={() => handleStatusChange(cm.id, ns)}
                            disabled={updatingId === cm.id}
                            className="px-3 py-1.5 text-xs font-medium bg-[#313ADF] text-white rounded-lg hover:bg-[#2730c0] disabled:opacity-50 transition-colors"
                          >
                            {updatingId === cm.id ? '...' : `→ ${STATUS_BADGES[ns]?.label}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
