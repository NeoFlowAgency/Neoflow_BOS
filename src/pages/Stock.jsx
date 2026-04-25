// src/pages/Stock.jsx — Refonte complète A→Z
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getStockLevels, listStockLocations, adjustStock,
  transferStock, listStockMovements, getStockAlerts
} from '../services/stockService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { canManageStock } from '../lib/permissions'
import { supabase } from '../lib/supabase'
import {
  Package, AlertTriangle, TrendingDown, Euro,
  Search, ArrowRightLeft, Pencil, MapPin,
  ArrowDownToLine, ArrowUpFromLine, Clock,
  Plus, Minus, RotateCcw, Warehouse, X
} from 'lucide-react'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MOVEMENT_LABELS = {
  in:            { label: 'Réception',        color: 'text-green-700 bg-green-50'  },
  out:           { label: 'Sortie',           color: 'text-red-700 bg-red-50'      },
  adjustment:    { label: 'Ajustement',       color: 'text-blue-700 bg-blue-50'    },
  reservation:   { label: 'Réservation',      color: 'text-amber-700 bg-amber-50'  },
  unreservation: { label: 'Libération',       color: 'text-teal-700 bg-teal-50'    },
  transfer_in:   { label: 'Transfert entrée', color: 'text-purple-700 bg-purple-50'},
  transfer_out:  { label: 'Transfert sortie', color: 'text-purple-700 bg-purple-50'},
}

const STATUS_TABS = [
  { key: 'all',     label: 'Tout'    },
  { key: 'rupture', label: 'Rupture' },
  { key: 'faible',  label: 'Faible'  },
  { key: 'normal',  label: 'Normal'  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusInfo(available) {
  if (available <= 0) return { label: 'Rupture', badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500',    key: 'rupture' }
  if (available < 3)  return { label: 'Faible',  badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400', key: 'faible'  }
  return               { label: 'Normal',  badge: 'bg-green-100 text-green-700',  dot: 'bg-green-500',  key: 'normal'  }
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-[#040741] leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function StatusBadge({ available }) {
  const s = getStatusInfo(available)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {available}
    </span>
  )
}

function MovementRow({ m }) {
  const meta = MOVEMENT_LABELS[m.movement_type] || { label: m.movement_type, color: 'text-gray-600 bg-gray-50' }
  return (
    <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-gray-100 hover:border-gray-200 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`px-2 py-0.5 rounded-md text-xs font-medium flex-shrink-0 ${meta.color}`}>{meta.label}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#040741] truncate">
            {m.product?.name ?? '—'}
            {m.product?.reference && (
              <span className="text-gray-400 font-normal ml-1.5 text-xs">#{m.product.reference}</span>
            )}
          </p>
          {m.location && (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <MapPin size={10} />{m.location.name}
            </p>
          )}
          {m.notes && <p className="text-xs text-gray-400 italic truncate">{m.notes}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span className={`text-sm font-bold tabular-nums ${
          m.quantity > 0 ? 'text-green-600' : m.quantity < 0 ? 'text-red-600' : 'text-gray-400'
        }`}>
          {m.quantity > 0 ? '+' : ''}{m.quantity}
        </span>
        <span className="text-xs text-gray-400 w-14 text-right">
          {new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
        </span>
      </div>
    </div>
  )
}

// ─── Modal Ajustement ─────────────────────────────────────────────────────────

function AdjustModal({ productView, locations, onClose, onDone, workspaceId }) {
  const toast = useToast()
  const [mode, setMode] = useState('entree')
  const [locationId, setLocationId] = useState(
    (locations.find(l => l.is_default) || locations[0])?.id ?? ''
  )
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const currentQty = productView.locations[locationId]?.quantity ?? 0
  const parsedQty = parseInt(qty) || 0

  const computedNew = () => {
    if (mode === 'entree')     return currentQty + parsedQty
    if (mode === 'sortie')     return Math.max(0, currentQty - parsedQty)
    return parsedQty
  }

  const canConfirm = mode === 'correction'
    ? qty !== '' && parsedQty >= 0
    : qty !== '' && parsedQty > 0

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const motif = notes ||
        (mode === 'entree' ? 'Réception de marchandises' :
         mode === 'sortie' ? 'Sortie de stock' : 'Correction inventaire')
      await adjustStock(workspaceId, productView.product.id, locationId, computedNew(), motif, user.id)
      toast.success('Stock mis à jour')
      onDone()
    } catch (err) {
      toast.error(err.message || 'Erreur ajustement')
    } finally {
      setSaving(false)
    }
  }

  const MODES = [
    { key: 'entree',     label: 'Entrée',    Icon: ArrowDownToLine, active: 'border-green-500 bg-green-50 text-green-700',   btn: 'bg-green-600 hover:bg-green-700' },
    { key: 'sortie',     label: 'Sortie',    Icon: ArrowUpFromLine, active: 'border-red-500 bg-red-50 text-red-700',         btn: 'bg-red-600 hover:bg-red-700'     },
    { key: 'correction', label: 'Correction',Icon: RotateCcw,       active: 'border-[#313ADF] bg-[#313ADF]/5 text-[#313ADF]', btn: 'bg-[#313ADF] hover:bg-[#2830c0]' },
  ]

  const currentMode = MODES.find(m => m.key === mode)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-[#040741]">Ajuster le stock</h3>
            <p className="text-sm text-gray-500 mt-0.5">{productView.product.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Mode */}
          <div className="grid grid-cols-3 gap-2">
            {MODES.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => { setMode(key); setQty('') }}
                className={`py-3 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-colors text-sm font-semibold
                  ${mode === key ? MODES.find(m => m.key === key).active : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>

          {/* Emplacement */}
          {locations.length > 1 && (
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Emplacement</label>
              <select
                value={locationId}
                onChange={e => setLocationId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} — {productView.locations[loc.id]?.quantity ?? 0} en stock
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantité */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                {mode === 'correction' ? 'Nouvelle quantité' : mode === 'entree' ? 'Quantité à ajouter' : 'Quantité à retirer'}
              </label>
              <span className="text-xs text-gray-400">
                Actuel : <span className="font-semibold text-[#040741]">{currentQty}</span>
                {qty !== '' && parsedQty > 0 && (
                  <span className={`ml-1.5 font-semibold ${
                    mode === 'entree' ? 'text-green-600' : mode === 'sortie' ? 'text-red-600' : 'text-[#313ADF]'
                  }`}>→ {computedNew()}</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty(String(Math.max(0, parsedQty - 1)))}
                className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <Minus size={16} className="text-gray-600" />
              </button>
              <input
                type="number" min={0} value={qty}
                onChange={e => setQty(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] font-bold text-xl text-center focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                placeholder="0"
                autoFocus
              />
              <button
                onClick={() => setQty(String(parsedQty + 1))}
                className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <Plus size={16} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Motif */}
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">
              Motif <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </label>
            <input
              type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder={
                mode === 'entree' ? 'Ex : Réception commande fournisseur' :
                mode === 'sortie' ? 'Ex : Casse, retour client' :
                'Ex : Inventaire annuel'
              }
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !canConfirm}
            className={`flex-1 py-3 text-white rounded-xl font-semibold text-sm disabled:opacity-40 transition-colors ${currentMode.btn}`}
          >
            {saving ? 'Enregistrement…' :
              mode === 'entree' ? "Valider l'entrée" :
              mode === 'sortie' ? 'Valider la sortie' : 'Corriger'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Transfert ──────────────────────────────────────────────────────────

function TransferModal({ productView, locations, onClose, onDone, workspaceId }) {
  const toast = useToast()
  const [fromId, setFromId] = useState(
    (locations.find(l => l.is_default) || locations[0])?.id ?? ''
  )
  const [toId, setToId] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)

  const currentQty = productView.locations[fromId]?.quantity ?? 0
  const parsedQty = parseInt(qty) || 0
  const canConfirm = toId && parsedQty > 0 && parsedQty <= currentQty && fromId !== toId

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await transferStock(workspaceId, productView.product.id, fromId, toId, parsedQty, user.id)
      toast.success('Transfert effectué')
      onDone()
    } catch (err) {
      toast.error(err.message || 'Erreur transfert')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-[#040741]">Transférer du stock</h3>
            <p className="text-sm text-gray-500 mt-0.5">{productView.product.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Depuis</label>
              <select
                value={fromId}
                onChange={e => setFromId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-[#040741] text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
              >
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({productView.locations[loc.id]?.quantity ?? 0})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Vers</label>
              <select
                value={toId}
                onChange={e => setToId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-[#040741] text-sm focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
              >
                <option value="">— Choisir</option>
                {locations.filter(l => l.id !== fromId).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Quantité</label>
              <span className="text-xs text-gray-400">
                Max : <span className="font-semibold text-[#040741]">{currentQty}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty(String(Math.max(0, parsedQty - 1)))}
                className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <Minus size={16} className="text-gray-600" />
              </button>
              <input
                type="number" min={1} max={currentQty} value={qty}
                onChange={e => setQty(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] font-bold text-xl text-center focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30"
                placeholder="0" autoFocus
              />
              <button
                onClick={() => setQty(String(Math.min(currentQty, parsedQty + 1)))}
                className="w-11 h-11 flex items-center justify-center border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <Plus size={16} className="text-gray-600" />
              </button>
            </div>
            {parsedQty > currentQty && (
              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={11} /> Quantité supérieure au stock disponible ({currentQty})
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !canConfirm}
            className="flex-1 py-3 bg-[#313ADF] text-white rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#2830c0] transition-colors"
          >
            {saving ? 'Transfert…' : 'Transférer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Stock() {
  const navigate = useNavigate()
  const { workspace, role } = useWorkspace()
  const toast = useToast()
  const canManage = canManageStock(role)

  const [levels, setLevels] = useState([])
  const [locations, setLocations] = useState([])
  const [alerts, setAlerts] = useState({ outOfStock: [], lowStock: [] })
  const [allMovements, setAllMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [movementsLoading, setMovementsLoading] = useState(false)

  const [activeTab, setActiveTab] = useState('produits')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [movSearch, setMovSearch] = useState('')

  const [adjustTarget, setAdjustTarget] = useState(null)
  const [transferTarget, setTransferTarget] = useState(null)

  // ─── Chargement ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (workspace?.id) loadAll()
  }, [workspace?.id])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [levelsData, locData, alertsData] = await Promise.all([
        getStockLevels(workspace.id),
        listStockLocations(workspace.id),
        getStockAlerts(workspace.id),
      ])
      setLevels(levelsData)
      setLocations(locData)
      setAlerts(alertsData)
    } catch {
      toast.error('Erreur lors du chargement du stock')
    } finally {
      setLoading(false)
    }
  }

  const loadMovements = async () => {
    if (allMovements.length > 0) return
    setMovementsLoading(true)
    try {
      const data = await listStockMovements(workspace.id, { limit: 100 })
      setAllMovements(data)
    } catch {
      toast.error('Erreur chargement mouvements')
    } finally {
      setMovementsLoading(false)
    }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'mouvements') loadMovements()
  }

  // ─── Données dérivées ─────────────────────────────────────────────────────────

  const productView = useMemo(() => {
    const map = {}
    for (const sl of levels) {
      if (!sl.product || sl.product.is_archived) continue
      const pid = sl.product.id
      if (!map[pid]) {
        map[pid] = {
          product: sl.product,
          locations: {},
          totalQuantity: 0,
          totalReserved: 0,
          totalAvailable: 0,
        }
      }
      const locId = sl.location?.id || 'unknown'
      const qty = sl.quantity || 0
      const reserved = sl.reserved_quantity || 0
      map[pid].locations[locId] = { location: sl.location, quantity: qty, reserved, available: qty - reserved }
      map[pid].totalQuantity  += qty
      map[pid].totalReserved  += reserved
      map[pid].totalAvailable += qty - reserved
    }
    return Object.values(map)
  }, [levels])

  const filteredProducts = useMemo(() => {
    return productView.filter(pv => {
      if (searchTerm) {
        const t = searchTerm.toLowerCase()
        if (!pv.product.name?.toLowerCase().includes(t) &&
            !pv.product.reference?.toLowerCase().includes(t)) return false
      }
      if (locationFilter && !pv.locations[locationFilter]) return false
      if (statusFilter !== 'all') {
        if (getStatusInfo(pv.totalAvailable).key !== statusFilter) return false
      }
      return true
    })
  }, [productView, searchTerm, locationFilter, statusFilter])

  const filteredMovements = useMemo(() => {
    if (!movSearch) return allMovements
    const t = movSearch.toLowerCase()
    return allMovements.filter(m =>
      m.product?.name?.toLowerCase().includes(t) ||
      m.product?.reference?.toLowerCase().includes(t) ||
      m.location?.name?.toLowerCase().includes(t) ||
      (MOVEMENT_LABELS[m.movement_type]?.label || '').toLowerCase().includes(t)
    )
  }, [allMovements, movSearch])

  const kpis = useMemo(() => {
    const valeur = productView.reduce((sum, pv) => {
      const prix = pv.product.cost_price_ht || pv.product.unit_price_ht || 0
      return sum + prix * pv.totalQuantity
    }, 0)
    return {
      totalRefs: productView.length,
      ruptures:  alerts.outOfStock.length,
      faible:    alerts.lowStock.length,
      valeur,
    }
  }, [productView, alerts])

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const openAdjust = (pv) => {
    if (!locations.length) return toast.error('Aucun emplacement configuré')
    setAdjustTarget(pv)
  }

  const openTransfer = (pv) => {
    if (locations.length < 2) return toast.error('Il faut au moins 2 emplacements pour un transfert')
    setTransferTarget(pv)
  }

  const handleModalDone = () => {
    setAdjustTarget(null)
    setTransferTarget(null)
    setAllMovements([])
    loadAll()
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-8 min-h-screen bg-gray-50">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Gestion du stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {productView.length} référence{productView.length !== 1 ? 's' : ''} · {locations.length} emplacement{locations.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => navigate('/stock/emplacements')}
            className="inline-flex items-center gap-2 bg-white border border-gray-200 text-[#040741] px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Warehouse size={16} className="text-[#313ADF]" />
            Emplacements
          </button>
        )}
      </div>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard icon={Package}       label="Références"   value={kpis.totalRefs} color="bg-[#313ADF]" />
          <KpiCard
            icon={AlertTriangle} label="Ruptures" value={kpis.ruptures} color="bg-red-500"
            sub={kpis.ruptures > 0 ? 'Action requise' : 'Aucune rupture'}
          />
          <KpiCard
            icon={TrendingDown}  label="Stock faible" value={kpis.faible} color="bg-orange-400"
            sub={kpis.faible > 0 ? 'À surveiller' : 'Tout est ok'}
          />
          <KpiCard
            icon={Euro} label="Valeur stock"
            value={`${kpis.valeur.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`}
            color="bg-[#040741]" sub="Prix achat HT"
          />
        </div>
      )}

      {/* Bannière rupture */}
      {!loading && alerts.outOfStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-700">
              {alerts.outOfStock.length} produit{alerts.outOfStock.length > 1 ? 's' : ''} en rupture
            </p>
            <p className="text-xs text-red-500 mt-0.5 truncate">
              {alerts.outOfStock.slice(0, 3).map(a => a.product.name).join(', ')}
              {alerts.outOfStock.length > 3 && ` + ${alerts.outOfStock.length - 3} autre(s)`}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1.5 mb-6 shadow-sm w-fit">
        {[
          { key: 'produits',   label: 'Produits',   Icon: Package },
          { key: 'mouvements', label: 'Mouvements', Icon: Clock   },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
              ${activeTab === key
                ? 'bg-[#313ADF] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════ ONGLET PRODUITS ══════════ */}
      {activeTab === 'produits' && (
        <>
          {/* Filtres */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Rechercher un produit, une référence…"
                className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] shadow-sm"
              />
            </div>
            {locations.length > 1 && (
              <select
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-[#040741] focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 shadow-sm"
              >
                <option value="">Tous les emplacements</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            )}
          </div>

          {/* Status pills */}
          <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
            {STATUS_TABS.map(({ key, label }) => {
              const count = key === 'all'     ? productView.length
                : key === 'rupture' ? alerts.outOfStock.length
                : key === 'faible'  ? alerts.lowStock.length
                : productView.length - alerts.outOfStock.length - alerts.lowStock.length
              const active = statusFilter === key
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border
                    ${active ? 'bg-[#040741] text-white border-[#040741]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                >
                  {label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold
                    ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Contenu */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#313ADF] border-t-transparent" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Package size={28} className="text-gray-400" />
              </div>
              <p className="font-semibold text-gray-700 mb-1">
                {searchTerm || locationFilter || statusFilter !== 'all'
                  ? 'Aucun produit correspondant'
                  : 'Aucun stock enregistré'}
              </p>
              <p className="text-sm text-gray-400">
                {searchTerm || locationFilter || statusFilter !== 'all'
                  ? 'Essayez de modifier vos filtres'
                  : 'Ajoutez des produits puis ajustez leurs niveaux de stock'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70">
                      <th className="text-left py-3.5 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produit</th>
                      {locations.map(loc => (
                        <th key={loc.id} className="text-center py-3.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <div>{loc.name}</div>
                          <div className="font-normal normal-case text-gray-400 text-xs">
                            {loc.type === 'store' ? 'Magasin' : loc.type === 'warehouse' ? 'Dépôt' : 'Exposition'}
                          </div>
                        </th>
                      ))}
                      <th className="text-center py-3.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dispo.</th>
                      {canManage && <th className="py-3.5 px-5 w-24" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredProducts.map(pv => (
                      <tr key={pv.product.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="py-4 px-5">
                          <p className="font-semibold text-[#040741] text-sm">{pv.product.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {pv.product.reference && (
                              <span className="text-xs text-gray-400 font-mono">#{pv.product.reference}</span>
                            )}
                            {pv.product.category && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md">{pv.product.category}</span>
                            )}
                          </div>
                        </td>
                        {locations.map(loc => {
                          const ld = pv.locations[loc.id]
                          return (
                            <td key={loc.id} className="py-4 px-3 text-center">
                              <StatusBadge available={ld?.available ?? 0} />
                              {(ld?.reserved ?? 0) > 0 && (
                                <p className="text-xs text-gray-400 mt-0.5">{ld.reserved} rés.</p>
                              )}
                            </td>
                          )
                        })}
                        <td className="py-4 px-3 text-center">
                          <StatusBadge available={pv.totalAvailable} />
                        </td>
                        {canManage && (
                          <td className="py-4 px-5">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openAdjust(pv)}
                                title="Ajuster le stock"
                                className="p-2 hover:bg-[#313ADF]/10 rounded-lg transition-colors"
                              >
                                <Pencil size={15} className="text-[#313ADF]" />
                              </button>
                              {locations.length > 1 && (
                                <button
                                  onClick={() => openTransfer(pv)}
                                  title="Transférer"
                                  className="p-2 hover:bg-purple-100 rounded-lg transition-colors"
                                >
                                  <ArrowRightLeft size={15} className="text-purple-600" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden space-y-3">
                {filteredProducts.map(pv => (
                  <div key={pv.product.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#040741] text-sm truncate">{pv.product.name}</p>
                        {pv.product.reference && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5">#{pv.product.reference}</p>
                        )}
                      </div>
                      <StatusBadge available={pv.totalAvailable} />
                    </div>
                    {locations.length > 1 && (
                      <div className="flex gap-2 flex-wrap mb-3">
                        {locations.map(loc => {
                          const ld = pv.locations[loc.id]
                          const avail = ld?.available ?? 0
                          const s = getStatusInfo(avail)
                          return (
                            <div key={loc.id} className="bg-gray-50 rounded-xl px-3 py-2 flex-1 min-w-[72px] text-center">
                              <p className="text-xs text-gray-400 truncate mb-1">{loc.name}</p>
                              <p className={`text-sm font-bold ${
                                s.key === 'normal' ? 'text-green-600' :
                                s.key === 'faible' ? 'text-orange-600' : 'text-red-600'
                              }`}>{ld?.quantity ?? 0}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {canManage && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openAdjust(pv)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#313ADF]/8 text-[#313ADF] rounded-xl text-sm font-medium border border-[#313ADF]/20 hover:bg-[#313ADF]/15 transition-colors"
                        >
                          <Pencil size={14} /> Ajuster
                        </button>
                        {locations.length > 1 && (
                          <button
                            onClick={() => openTransfer(pv)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium border border-purple-200 hover:bg-purple-100 transition-colors"
                          >
                            <ArrowRightLeft size={14} /> Transférer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════ ONGLET MOUVEMENTS ══════════ */}
      {activeTab === 'mouvements' && (
        <>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text" value={movSearch}
              onChange={e => setMovSearch(e.target.value)}
              placeholder="Filtrer par produit, emplacement, type…"
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] shadow-sm"
            />
          </div>
          {movementsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#313ADF] border-t-transparent" />
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <Clock size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucun mouvement enregistré</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMovements.map(m => <MovementRow key={m.id} m={m} />)}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {adjustTarget && (
        <AdjustModal
          productView={adjustTarget}
          locations={locations}
          onClose={() => setAdjustTarget(null)}
          onDone={handleModalDone}
          workspaceId={workspace.id}
        />
      )}
      {transferTarget && (
        <TransferModal
          productView={transferTarget}
          locations={locations}
          onClose={() => setTransferTarget(null)}
          onDone={handleModalDone}
          workspaceId={workspace.id}
        />
      )}
    </div>
  )
}
