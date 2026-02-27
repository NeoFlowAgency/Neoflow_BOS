import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStockLevels, listStockLocations, adjustStock, transferStock, listStockMovements, getStockAlerts } from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { canManageStock } from '../lib/permissions'
import { supabase } from '../lib/supabase'

const MOVEMENT_LABELS = {
  in: 'Entree',
  out: 'Sortie',
  adjustment: 'Ajustement',
  reservation: 'Reservation',
  unreservation: 'Liberation',
  transfer_in: 'Transfert entree',
  transfer_out: 'Transfert sortie'
}

export default function Stock() {
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()
  const toast = useToast()
  const canManage = canManageStock(role)

  const [levels, setLevels] = useState([])
  const [locations, setLocations] = useState([])
  const [alerts, setAlerts] = useState({ outOfStock: [], lowStock: [] })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // Adjust modal
  const [adjustModal, setAdjustModal] = useState(null)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjustLoading, setAdjustLoading] = useState(false)

  // Transfer modal
  const [transferModal, setTransferModal] = useState(null)
  const [transferToLocation, setTransferToLocation] = useState('')
  const [transferQty, setTransferQty] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)

  // Expanded row (movements)
  const [expandedProduct, setExpandedProduct] = useState(null)
  const [movements, setMovements] = useState([])
  const [movementsLoading, setMovementsLoading] = useState(false)

  useEffect(() => {
    if (workspace?.id) loadAll()
  }, [workspace?.id])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [levelsData, locData, alertsData] = await Promise.all([
        getStockLevels(workspace.id),
        listStockLocations(workspace.id),
        getStockAlerts(workspace.id)
      ])
      setLevels(levelsData)
      setLocations(locData)
      setAlerts(alertsData)
    } catch (err) {
      console.error('Erreur chargement stock:', err)
      toast.error('Erreur lors du chargement du stock')
    } finally {
      setLoading(false)
    }
  }

  // Build product-centric view from stock_levels
  const buildProductView = () => {
    const productMap = {}
    for (const sl of levels) {
      if (!sl.product || sl.product.is_archived) continue
      const pid = sl.product.id
      if (!productMap[pid]) {
        productMap[pid] = {
          product: sl.product,
          locations: {},
          totalQuantity: 0,
          totalReserved: 0,
          totalAvailable: 0
        }
      }
      const locId = sl.location?.id || 'unknown'
      productMap[pid].locations[locId] = {
        location: sl.location,
        quantity: sl.quantity || 0,
        reserved: sl.reserved_quantity || 0,
        available: (sl.quantity || 0) - (sl.reserved_quantity || 0)
      }
      productMap[pid].totalQuantity += sl.quantity || 0
      productMap[pid].totalReserved += sl.reserved_quantity || 0
      productMap[pid].totalAvailable += (sl.quantity || 0) - (sl.reserved_quantity || 0)
    }
    return Object.values(productMap)
  }

  const productView = buildProductView()

  // Get unique categories
  const categories = [...new Set(productView.map(pv => pv.product.category).filter(Boolean))]

  // Filter products
  const filteredProducts = productView.filter(pv => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      if (!pv.product.name?.toLowerCase().includes(term) && !pv.product.reference?.toLowerCase().includes(term)) return false
    }
    if (categoryFilter && pv.product.category !== categoryFilter) return false
    if (locationFilter) {
      if (!pv.locations[locationFilter]) return false
    }
    return true
  })

  const getStockColor = (available) => {
    if (available <= 0) return 'text-red-600 bg-red-50'
    if (available < 3) return 'text-orange-600 bg-orange-50'
    return 'text-green-600 bg-green-50'
  }

  const handleExpand = async (productId) => {
    if (expandedProduct === productId) {
      setExpandedProduct(null)
      return
    }
    setExpandedProduct(productId)
    setMovementsLoading(true)
    try {
      const data = await listStockMovements(workspace.id, { product_id: productId, limit: 10 })
      setMovements(data)
    } catch (err) {
      console.error('Erreur mouvements:', err)
    } finally {
      setMovementsLoading(false)
    }
  }

  const handleAdjust = async () => {
    if (!adjustModal || adjustQty === '') return
    setAdjustLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await adjustStock(workspace.id, adjustModal.productId, adjustModal.locationId, parseFloat(adjustQty), adjustNotes, user.id)
      toast.success('Stock ajuste')
      setAdjustModal(null)
      setAdjustQty('')
      setAdjustNotes('')
      loadAll()
    } catch (err) {
      toast.error(err.message || 'Erreur ajustement')
    } finally {
      setAdjustLoading(false)
    }
  }

  const handleTransfer = async () => {
    if (!transferModal || !transferToLocation || !transferQty) return
    setTransferLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await transferStock(workspace.id, transferModal.productId, transferModal.locationId, transferToLocation, parseInt(transferQty), user.id)
      toast.success('Transfert effectue')
      setTransferModal(null)
      setTransferToLocation('')
      setTransferQty('')
      loadAll()
    } catch (err) {
      toast.error(err.message || 'Erreur transfert')
    } finally {
      setTransferLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Stock</h1>
          <p className="text-gray-500">{filteredProducts.length} produit{filteredProducts.length !== 1 ? 's' : ''} en stock</p>
        </div>
        {canManage && (
          <button
            onClick={() => navigate('/stock/emplacements')}
            className="flex items-center gap-2 bg-white border border-gray-200 text-[#040741] px-5 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm"
          >
            <svg className="w-5 h-5 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Gerer les emplacements
          </button>
        )}
      </div>

      {/* Alertes */}
      {(alerts.outOfStock.length > 0 || alerts.lowStock.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {alerts.outOfStock.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="font-semibold text-red-700">Rupture de stock ({alerts.outOfStock.length})</span>
              </div>
              <div className="space-y-1">
                {alerts.outOfStock.slice(0, 5).map(a => (
                  <p key={a.product.id} className="text-sm text-red-600">
                    {a.product.reference && <span className="font-medium">{a.product.reference} - </span>}
                    {a.product.name}
                  </p>
                ))}
                {alerts.outOfStock.length > 5 && (
                  <p className="text-xs text-red-400">et {alerts.outOfStock.length - 5} autre(s)...</p>
                )}
              </div>
            </div>
          )}
          {alerts.lowStock.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold text-orange-700">Stock faible ({alerts.lowStock.length})</span>
              </div>
              <div className="space-y-1">
                {alerts.lowStock.slice(0, 5).map(a => (
                  <p key={a.product.id} className="text-sm text-orange-600">
                    {a.product.reference && <span className="font-medium">{a.product.reference} - </span>}
                    {a.product.name} ({a.totalAvailable} dispo.)
                  </p>
                ))}
                {alerts.lowStock.length > 5 && (
                  <p className="text-xs text-orange-400">et {alerts.lowStock.length - 5} autre(s)...</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher par nom ou reference..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] shadow-sm"
          />
        </div>
        {locations.length > 1 && (
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 shadow-sm"
          >
            <option value="">Tous les emplacements</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        )}
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 shadow-sm"
          >
            <option value="">Toutes les categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table stock */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
          <p className="text-gray-500 mb-2">
            {searchTerm || locationFilter || categoryFilter ? 'Aucun produit correspondant' : 'Aucun stock enregistre'}
          </p>
          <p className="text-sm text-gray-400">
            Ajoutez des produits puis ajustez leurs niveaux de stock
          </p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-4 px-6 font-semibold text-[#040741] text-sm">Produit</th>
                  {locations.map(loc => (
                    <th key={loc.id} className="text-center py-4 px-4 font-semibold text-[#040741] text-sm">
                      {loc.name}
                      <span className="block text-xs font-normal text-gray-400 capitalize">{loc.type === 'store' ? 'Magasin' : loc.type === 'warehouse' ? 'Depot' : 'Exposition'}</span>
                    </th>
                  ))}
                  <th className="text-center py-4 px-4 font-semibold text-[#040741] text-sm">Total dispo.</th>
                  {canManage && <th className="py-4 px-4"></th>}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(pv => (
                  <>
                    <tr
                      key={pv.product.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => handleExpand(pv.product.id)}
                    >
                      <td className="py-4 px-6">
                        <p className="font-semibold text-[#040741] text-sm">{pv.product.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {pv.product.reference && <span className="text-xs text-gray-400">{pv.product.reference}</span>}
                          {pv.product.category && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{pv.product.category}</span>
                          )}
                        </div>
                      </td>
                      {locations.map(loc => {
                        const locData = pv.locations[loc.id]
                        const qty = locData?.quantity || 0
                        const reserved = locData?.reserved || 0
                        const available = locData?.available || 0
                        return (
                          <td key={loc.id} className="py-4 px-4 text-center">
                            <span className={`inline-block px-2.5 py-1 rounded-lg font-semibold text-sm ${getStockColor(available)}`}>
                              {qty}
                            </span>
                            {reserved > 0 && (
                              <span className="block text-xs text-gray-400 mt-0.5">{reserved} reserve(s)</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-block px-3 py-1 rounded-lg font-bold text-sm ${getStockColor(pv.totalAvailable)}`}>
                          {pv.totalAvailable}
                        </span>
                      </td>
                      {canManage && (
                        <td className="py-4 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={() => {
                                const defaultLoc = locations.find(l => l.is_default) || locations[0]
                                if (defaultLoc) {
                                  const locData = pv.locations[defaultLoc.id]
                                  setAdjustModal({ productId: pv.product.id, locationId: defaultLoc.id, productName: pv.product.name, locationName: defaultLoc.name, currentQty: locData?.quantity || 0 })
                                  setAdjustQty(String(locData?.quantity || 0))
                                }
                              }}
                              className="p-2 hover:bg-[#313ADF]/10 rounded-lg transition-colors"
                              title="Ajuster"
                            >
                              <svg className="w-4 h-4 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            {locations.length > 1 && (
                              <button
                                onClick={() => {
                                  const defaultLoc = locations.find(l => l.is_default) || locations[0]
                                  if (defaultLoc) {
                                    setTransferModal({ productId: pv.product.id, locationId: defaultLoc.id, productName: pv.product.name, locationName: defaultLoc.name, currentQty: pv.locations[defaultLoc.id]?.quantity || 0 })
                                    setTransferToLocation('')
                                    setTransferQty('')
                                  }
                                }}
                                className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
                                title="Transferer"
                              >
                                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {/* Expanded movements */}
                    {expandedProduct === pv.product.id && (
                      <tr key={`${pv.product.id}-expanded`}>
                        <td colSpan={locations.length + (canManage ? 3 : 2)} className="bg-gray-50 px-6 py-4">
                          <h4 className="text-sm font-semibold text-[#040741] mb-3">Derniers mouvements</h4>
                          {movementsLoading ? (
                            <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#313ADF] border-t-transparent"></div>
                              Chargement...
                            </div>
                          ) : movements.length === 0 ? (
                            <p className="text-sm text-gray-400">Aucun mouvement enregistre</p>
                          ) : (
                            <div className="space-y-2">
                              {movements.map(m => (
                                <div key={m.id} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-gray-100">
                                  <div className="flex items-center gap-3">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      m.quantity > 0 ? 'bg-green-500' : m.quantity < 0 ? 'bg-red-500' : 'bg-gray-400'
                                    }`} />
                                    <div>
                                      <span className="text-sm font-medium text-[#040741]">
                                        {MOVEMENT_LABELS[m.movement_type] || m.movement_type}
                                      </span>
                                      {m.location && <span className="text-xs text-gray-400 ml-2">{m.location.name}</span>}
                                      {m.notes && <p className="text-xs text-gray-400">{m.notes}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className={`font-semibold text-sm ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                      {new Date(m.created_at).toLocaleDateString('fr-FR')}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {filteredProducts.map(pv => (
              <div
                key={pv.product.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-[#040741] text-sm">{pv.product.name}</p>
                    {pv.product.reference && <p className="text-xs text-gray-400">{pv.product.reference}</p>}
                  </div>
                  <span className={`px-3 py-1 rounded-lg font-bold text-sm ${getStockColor(pv.totalAvailable)}`}>
                    {pv.totalAvailable}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {locations.map(loc => {
                    const locData = pv.locations[loc.id]
                    const available = locData?.available || 0
                    return (
                      <div key={loc.id} className="text-center bg-gray-50 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-400">{loc.name}</p>
                        <p className={`font-semibold text-sm ${getStockColor(available)}`}>{locData?.quantity || 0}</p>
                      </div>
                    )
                  })}
                </div>
                {canManage && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        const defaultLoc = locations.find(l => l.is_default) || locations[0]
                        if (defaultLoc) {
                          const locData = pv.locations[defaultLoc.id]
                          setAdjustModal({ productId: pv.product.id, locationId: defaultLoc.id, productName: pv.product.name, locationName: defaultLoc.name, currentQty: locData?.quantity || 0 })
                          setAdjustQty(String(locData?.quantity || 0))
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#313ADF]/10 text-[#313ADF] rounded-xl text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Ajuster
                    </button>
                    {locations.length > 1 && (
                      <button
                        onClick={() => {
                          const defaultLoc = locations.find(l => l.is_default) || locations[0]
                          if (defaultLoc) {
                            setTransferModal({ productId: pv.product.id, locationId: defaultLoc.id, productName: pv.product.name, locationName: defaultLoc.name, currentQty: pv.locations[defaultLoc.id]?.quantity || 0 })
                            setTransferToLocation('')
                            setTransferQty('')
                          }
                        }}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-purple-50 text-purple-600 rounded-xl text-sm font-medium"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        Transferer
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Ajustement */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-[#040741] mb-1">Ajuster le stock</h3>
            <p className="text-sm text-gray-500 mb-6">{adjustModal.productName} - {adjustModal.locationName}</p>

            {/* Location selector */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#040741] mb-2">Emplacement</label>
              <select
                value={adjustModal.locationId}
                onChange={(e) => {
                  const locId = e.target.value
                  const loc = locations.find(l => l.id === locId)
                  const pv = filteredProducts.find(p => p.product.id === adjustModal.productId)
                  const locData = pv?.locations[locId]
                  setAdjustModal({ ...adjustModal, locationId: locId, locationName: loc?.name || '', currentQty: locData?.quantity || 0 })
                  setAdjustQty(String(locData?.quantity || 0))
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#040741] mb-2">
                Nouvelle quantite <span className="font-normal text-gray-400">(actuellement : {adjustModal.currentQty})</span>
              </label>
              <input
                type="number"
                min={0}
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                autoFocus
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-[#040741] mb-2">Motif (optionnel)</label>
              <input
                type="text"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                placeholder="Ex: Inventaire, reception, casse..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setAdjustModal(null); setAdjustQty(''); setAdjustNotes('') }} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200">
                Annuler
              </button>
              <button onClick={handleAdjust} disabled={adjustLoading || adjustQty === ''} className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-medium hover:bg-[#4149e8] disabled:opacity-50">
                {adjustLoading ? 'Ajustement...' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Transfert */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-[#040741] mb-1">Transferer du stock</h3>
            <p className="text-sm text-gray-500 mb-6">{transferModal.productName}</p>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#040741] mb-2">De</label>
              <select
                value={transferModal.locationId}
                onChange={(e) => {
                  const locId = e.target.value
                  const loc = locations.find(l => l.id === locId)
                  const pv = filteredProducts.find(p => p.product.id === transferModal.productId)
                  setTransferModal({ ...transferModal, locationId: locId, locationName: loc?.name || '', currentQty: pv?.locations[locId]?.quantity || 0 })
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name} ({
                    filteredProducts.find(p => p.product.id === transferModal.productId)?.locations[loc.id]?.quantity || 0
                  } en stock)</option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#040741] mb-2">Vers</label>
              <select
                value={transferToLocation}
                onChange={(e) => setTransferToLocation(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
              >
                <option value="">Selectionner un emplacement</option>
                {locations.filter(l => l.id !== transferModal.locationId).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-[#040741] mb-2">
                Quantite <span className="font-normal text-gray-400">(max: {transferModal.currentQty})</span>
              </label>
              <input
                type="number"
                min={1}
                max={transferModal.currentQty}
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setTransferModal(null); setTransferToLocation(''); setTransferQty('') }} className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200">
                Annuler
              </button>
              <button onClick={handleTransfer} disabled={transferLoading || !transferToLocation || !transferQty} className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50">
                {transferLoading ? 'Transfert...' : 'Transferer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
