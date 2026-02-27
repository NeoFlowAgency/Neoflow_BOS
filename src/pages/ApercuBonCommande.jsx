import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getPurchaseOrder, updatePurchaseOrderStatus, receiveGoods } from '../services/supplierService'
import { listStockLocations } from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { canManageSuppliers } from '../lib/permissions'

const STATUS_CONFIG = {
  brouillon:           { bg: 'bg-gray-100',    text: 'text-gray-700',   label: 'Brouillon',           next: 'envoye',    nextLabel: 'Marquer comme envoye' },
  envoye:              { bg: 'bg-blue-100',    text: 'text-blue-700',   label: 'Envoye',              next: 'confirme',  nextLabel: 'Confirmer la reception' },
  confirme:            { bg: 'bg-indigo-100',  text: 'text-indigo-700', label: 'Confirme',            next: null,        nextLabel: null },
  reception_partielle: { bg: 'bg-orange-100',  text: 'text-orange-700', label: 'Reception partielle', next: null,        nextLabel: null },
  recu:                { bg: 'bg-green-100',   text: 'text-green-700',  label: 'Recu',                next: null,        nextLabel: null },
  annule:              { bg: 'bg-red-100',     text: 'text-red-700',    label: 'Annule',              next: null,        nextLabel: null }
}

const RECEPTION_STATES = ['confirme', 'envoye', 'reception_partielle']

export default function ApercuBonCommande() {
  const { bonCommandeId } = useParams()
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()
  const toast = useToast()

  const [po, setPo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Modal reception
  const [showReception, setShowReception] = useState(false)
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState('')
  const [receivedQtys, setReceivedQtys] = useState({}) // itemId -> qty
  const [receivingLoading, setReceivingLoading] = useState(false)

  // Modal annulation
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const canManage = canManageSuppliers(role)

  useEffect(() => {
    if (bonCommandeId) loadPo()
  }, [bonCommandeId])

  const loadPo = async () => {
    try {
      const data = await getPurchaseOrder(bonCommandeId)
      setPo(data)
      // Init received quantities from existing data
      const qtys = {}
      for (const item of data.items || []) {
        qtys[item.id] = item.quantity_received || 0
      }
      setReceivedQtys(qtys)
    } catch (err) {
      console.error('Erreur:', err)
      toast.error('Erreur chargement bon de commande')
    } finally {
      setLoading(false)
    }
  }

  const loadLocations = async () => {
    try {
      const data = await listStockLocations(workspace.id)
      setLocations(data)
      if (data.length > 0) setSelectedLocation(data[0].id)
    } catch (err) {
      console.error('Erreur:', err)
    }
  }

  const handleStatusChange = async (newStatus) => {
    if (!canManage) return
    setUpdatingStatus(true)
    try {
      await updatePurchaseOrderStatus(bonCommandeId, newStatus)
      toast.success('Statut mis a jour')
      loadPo()
    } catch (err) {
      toast.error(err.message || 'Erreur mise a jour statut')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const openReception = async () => {
    await loadLocations()
    setShowReception(true)
  }

  const handleReceiveGoods = async () => {
    if (!selectedLocation) {
      toast.error('Veuillez selectionner un emplacement de stock')
      return
    }

    const itemsToReceive = (po.items || []).map(item => ({
      id: item.id,
      quantity_received: (item.quantity_received || 0) + (parseInt(receivedQtys[item.id]) || 0),
      quantity_to_add: parseInt(receivedQtys[item.id]) || 0
    })).filter(i => i.quantity_to_add > 0)

    if (itemsToReceive.length === 0) {
      toast.error('Veuillez saisir au moins une quantite recue')
      return
    }

    setReceivingLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const result = await receiveGoods(workspace.id, bonCommandeId, itemsToReceive, selectedLocation, user.id)
      toast.success(result.status === 'recu' ? 'Reception totale enregistree !' : 'Reception partielle enregistree !')
      setShowReception(false)
      loadPo()
    } catch (err) {
      toast.error(err.message || 'Erreur lors de la reception')
    } finally {
      setReceivingLoading(false)
    }
  }

  const handleCancel = async () => {
    setUpdatingStatus(true)
    try {
      await updatePurchaseOrderStatus(bonCommandeId, 'annule')
      toast.success('Bon de commande annule')
      setShowCancelConfirm(false)
      loadPo()
    } catch (err) {
      toast.error(err.message || 'Erreur annulation')
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
      </div>
    )
  }

  if (!po) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 mb-4">Bon de commande non trouve</p>
        <button onClick={() => navigate('/fournisseurs')} className="bg-[#313ADF] text-white px-6 py-2 rounded-xl font-semibold">
          Retour aux fournisseurs
        </button>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[po.status] || STATUS_CONFIG.brouillon
  const canReceive = canManage && RECEPTION_STATES.includes(po.status)
  const canCancel = canManage && !['recu', 'annule'].includes(po.status)
  const items = po.items || []

  return (
    <div className="p-4 md:p-8 min-h-screen max-w-4xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">{po.po_number}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
              {statusCfg.label}
            </span>
          </div>
          <p className="text-gray-500">
            Fournisseur : <span className="font-medium text-[#040741]">{po.supplier?.name}</span>
          </p>
        </div>

        {canManage && (
          <div className="flex gap-2 flex-wrap">
            {statusCfg.next && (
              <button
                onClick={() => handleStatusChange(statusCfg.next)}
                disabled={updatingStatus}
                className="flex items-center gap-2 px-4 py-2 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] disabled:opacity-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {statusCfg.nextLabel}
              </button>
            )}
            {canReceive && (
              <button
                onClick={openReception}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Recevoir marchandise
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Annuler
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lignes produits */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-bold text-[#040741] flex items-center gap-2">
                <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Produits ({items.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produit</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Commande</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Recu</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Cout HT</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => {
                    const received = item.quantity_received || 0
                    const isFullyReceived = received >= item.quantity_ordered
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-[#040741]">{item.product?.name}</p>
                          {item.product?.reference && <p className="text-xs text-gray-400">{item.product.reference}</p>}
                        </td>
                        <td className="px-6 py-4 text-center font-semibold text-[#040741]">
                          {item.quantity_ordered}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-semibold ${isFullyReceived ? 'text-green-600' : received > 0 ? 'text-orange-500' : 'text-gray-400'}`}>
                            {received}
                          </span>
                          {!isFullyReceived && received > 0 && (
                            <span className="text-xs text-gray-400 ml-1">/ {item.quantity_ordered}</span>
                          )}
                          {isFullyReceived && (
                            <svg className="w-4 h-4 text-green-500 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-gray-600">
                          {(item.unit_cost_ht || 0).toFixed(2)} EUR
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-[#040741]">
                          {(item.total_ht || 0).toFixed(2)} EUR
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="px-6 py-3 text-right text-sm font-semibold text-gray-500">Total HT</td>
                    <td className="px-6 py-3 text-right font-bold text-[#040741]">{(po.total_ht || 0).toFixed(2)} EUR</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-400">TVA (20%)</td>
                    <td className="px-6 py-2 text-right text-gray-500">{((po.total_ht || 0) * 0.20).toFixed(2)} EUR</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-[#040741]">Total TTC</td>
                    <td className="px-6 py-3 text-right font-bold text-lg text-[#313ADF]">{(po.total_ttc || 0).toFixed(2)} EUR</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {po.notes && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
              <h3 className="text-sm font-bold text-[#040741] mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{po.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar infos */}
        <div className="space-y-4">
          {/* Details */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <h3 className="text-sm font-bold text-[#040741] mb-4">Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Statut</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                  {statusCfg.label}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Cree le</p>
                <p className="text-sm font-medium text-[#040741]">{new Date(po.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
              {po.expected_date && (
                <div>
                  <p className="text-xs text-gray-400">Livraison prevue</p>
                  <p className="text-sm font-medium text-[#040741]">{new Date(po.expected_date).toLocaleDateString('fr-FR')}</p>
                </div>
              )}
              {po.received_date && (
                <div>
                  <p className="text-xs text-gray-400">Recue le</p>
                  <p className="text-sm font-medium text-green-600">{new Date(po.received_date).toLocaleDateString('fr-FR')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Fournisseur */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#040741]">Fournisseur</h3>
              <button
                onClick={() => navigate(`/fournisseurs/${po.supplier_id}`)}
                className="text-xs text-[#313ADF] font-medium hover:underline"
              >
                Voir fiche
              </button>
            </div>
            <p className="text-sm font-medium text-[#040741]">{po.supplier?.name}</p>
            {po.supplier?.email && <p className="text-xs text-gray-400 mt-1">{po.supplier.email}</p>}
            {po.supplier?.phone && <p className="text-xs text-gray-400">{po.supplier.phone}</p>}
          </div>

          {/* Avancement reception */}
          {['confirme', 'reception_partielle', 'recu'].includes(po.status) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-6">
              <h3 className="text-sm font-bold text-[#040741] mb-3">Avancement reception</h3>
              {items.map(item => {
                const received = item.quantity_received || 0
                const pct = Math.min(100, Math.round((received / item.quantity_ordered) * 100))
                return (
                  <div key={item.id} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate max-w-[120px]">{item.product?.name}</span>
                      <span className="text-gray-500 ml-2">{received}/{item.quantity_ordered}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-orange-400' : 'bg-gray-200'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Retour */}
      <button
        onClick={() => navigate(`/fournisseurs/${po.supplier_id}`)}
        className="mt-8 inline-flex items-center gap-2 px-6 py-3 text-[#040741] font-medium hover:bg-gray-100 rounded-xl transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Retour au fournisseur
      </button>

      {/* Modal Reception marchandise */}
      {showReception && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#040741]">Recevoir la marchandise</h3>
              <p className="text-sm text-gray-500 mt-1">Saisir les quantites recues. Le stock sera mis a jour automatiquement.</p>
            </div>

            <div className="p-6 space-y-5">
              {/* Emplacement */}
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">Emplacement de reception *</label>
                <div className="relative">
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] appearance-none focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                  >
                    <option value="">Selectionner un emplacement</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name} ({loc.location_type})</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Lignes */}
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-3">Quantites recues dans cette livraison</label>
                <div className="space-y-3">
                  {items.map(item => {
                    const alreadyReceived = item.quantity_received || 0
                    const remaining = item.quantity_ordered - alreadyReceived
                    return (
                      <div key={item.id} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-medium text-[#040741]">{item.product?.name}</p>
                            <p className="text-xs text-gray-400">
                              Commande: {item.quantity_ordered} | Deja recu: {alreadyReceived} | Restant: {Math.max(0, remaining)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-gray-500 whitespace-nowrap">Recu maintenant :</label>
                          <input
                            type="number"
                            min={0}
                            max={Math.max(0, remaining)}
                            value={receivedQtys[item.id] ?? 0}
                            onChange={(e) => setReceivedQtys(prev => ({
                              ...prev,
                              [item.id]: Math.min(Math.max(0, parseInt(e.target.value) || 0), Math.max(0, remaining))
                            }))}
                            className="w-24 bg-white border border-gray-200 rounded-xl px-3 py-2 text-center font-semibold text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                          />
                          <span className="text-xs text-gray-400">/ {Math.max(0, remaining)} restant(s)</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowReception(false)}
                className="px-6 py-2 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleReceiveGoods}
                disabled={receivingLoading || !selectedLocation}
                className="px-6 py-2 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {receivingLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Enregistrer la reception
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation annulation */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-[#040741]">Annuler le bon de commande ?</h3>
                <p className="text-sm text-gray-500">Cette action est irreversible.</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="px-6 py-2 border border-gray-200 rounded-xl font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Non
              </button>
              <button
                onClick={handleCancel}
                disabled={updatingStatus}
                className="px-6 py-2 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Oui, annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
