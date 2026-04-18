import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// ── Van icon factory ─────────────────────────────────────────────────────────

function createVanIcon(heading = 0, isMoving = false, isOnline = false) {
  const bg = !isOnline ? '#9CA3AF' : isMoving ? '#10B981' : '#313ADF'
  const ringHtml = isMoving && isOnline ? `
    <div style="position:absolute;inset:-6px;border-radius:50%;border:2.5px solid ${bg};
      animation:vanring 1.4s ease-out infinite;opacity:.7;pointer-events:none"></div>
    <div style="position:absolute;inset:-14px;border-radius:50%;border:2px solid ${bg};
      animation:vanring 1.4s ease-out .5s infinite;opacity:.4;pointer-events:none"></div>
  ` : ''

  const angle = heading || 0
  return L.divIcon({
    html: `<style>@keyframes vanring{0%{transform:scale(.7);opacity:.8}100%{transform:scale(2.2);opacity:0}}</style>
      <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center">
        ${ringHtml}
        <div style="
          width:40px;height:40px;border-radius:50%;background:${bg};
          box-shadow:0 4px 14px rgba(0,0,0,.5);
          display:flex;align-items:center;justify-content:center;
          position:relative;z-index:1;flex-shrink:0;
        ">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
               style="transform:rotate(${angle}deg);transition:transform .6s ease">
            <path d="M12 2 L19 10 L5 10 Z" fill="white"/>
            <rect x="5" y="10" width="14" height="10" rx="2" fill="white"/>
            <circle cx="8" cy="21" r="1.5" fill="rgba(255,255,255,.6)"/>
            <circle cx="16" cy="21" r="1.5" fill="rgba(255,255,255,.6)"/>
          </svg>
        </div>
      </div>`,
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -26],
  })
}

// ── MapController: flyTo quand selectedPos change ────────────────────────────

function MapController({ flyTo }) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lng], 16, { animate: true, duration: 1.2 })
  }, [flyTo])
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'jamais'
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60) return `${Math.round(diff)}s`
  if (diff < 3600) return `${Math.round(diff / 60)} min`
  return `${Math.round(diff / 3600)} h`
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('')
}

const STATUS_LABEL = {
  a_planifier: 'À planifier',
  planifiee:   'Planifiée',
  en_cours:    'En cours',
  livree:      'Livrée',
  annulee:     'Annulée',
}

const STATUS_DOT = {
  planifiee: 'bg-blue-400',
  en_cours:  'bg-yellow-400',
  livree:    'bg-green-500',
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CarteLivraisons() {
  const navigate = useNavigate()
  const { workspace } = useWorkspace()

  const [livreurs, setLivreurs]               = useState([])
  const [members, setMembers]                 = useState({})
  const [deliveriesByUser, setDeliveriesByUser] = useState({})
  const [selectedId, setSelectedId]           = useState(null)
  const [flyTo, setFlyTo]                     = useState(null)
  const [panelExpanded, setPanelExpanded]     = useState(true)
  const [lastRefresh, setLastRefresh]         = useState(null)
  const pollRef                               = useRef(null)

  const FIVE_MIN = 5 * 60 * 1000

  // ── Load members ─────────────────────────────────────────────────────────
  const loadMembers = useCallback(async () => {
    if (!workspace?.id) return
    const { data: wu } = await supabase
      .from('workspace_users')
      .select('user_id, role')
      .eq('workspace_id', workspace.id)
    const uids = (wu || []).map(m => m.user_id)
    if (!uids.length) return
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', uids)
    const map = {}
    ;(wu || []).forEach(m => {
      const p = (profiles || []).find(p => p.id === m.user_id)
      map[m.user_id] = { name: p?.full_name || 'Livreur', role: m.role }
    })
    setMembers(map)
  }, [workspace?.id])

  // ── Load positions + deliveries ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!workspace?.id) return
    try {
      const [posRes, delRes, assignRes] = await Promise.all([
        supabase
          .from('livreur_positions')
          .select('user_id, lat, lng, heading, speed, is_tracking, updated_at')
          .eq('workspace_id', workspace.id),
        supabase
          .from('deliveries')
          .select('id, status, scheduled_date, time_slot, assigned_to, order:orders(order_number, customers(first_name, last_name))')
          .eq('workspace_id', workspace.id)
          .not('status', 'in', '(annulee)'),
        supabase
          .from('delivery_assignments')
          .select('delivery_id, user_id')
          .eq('workspace_id', workspace.id),
      ])

      const now = Date.now()
      const positions = (posRes.data || []).map(p => ({
        ...p,
        isOnline:  p.is_tracking && (now - new Date(p.updated_at).getTime()) < FIVE_MIN,
        isMoving:  p.is_tracking && (p.speed || 0) > 0.5,
        name:      members[p.user_id]?.name || 'Livreur',
      }))
      setLivreurs(positions)

      // Build deliveriesByUser (from assignments + legacy assigned_to)
      const deliveries = delRes.data || []
      const assignments = assignRes.data || []
      const byUser = {}

      assignments.forEach(a => {
        if (!byUser[a.user_id]) byUser[a.user_id] = []
        const d = deliveries.find(d => d.id === a.delivery_id)
        if (d && !byUser[a.user_id].find(x => x.id === d.id)) byUser[a.user_id].push(d)
      })
      deliveries.forEach(d => {
        if (d.assigned_to) {
          if (!byUser[d.assigned_to]) byUser[d.assigned_to] = []
          if (!byUser[d.assigned_to].find(x => x.id === d.id)) byUser[d.assigned_to].push(d)
        }
      })
      setDeliveriesByUser(byUser)
      setLastRefresh(new Date())
    } catch (err) {
      console.error('[CarteLivraisons]', err)
    }
  }, [workspace?.id, members])

  useEffect(() => { loadMembers() }, [loadMembers])

  useEffect(() => {
    if (!workspace?.id || !Object.keys(members).length) return
    loadData()
    pollRef.current = setInterval(loadData, 5000)
    return () => clearInterval(pollRef.current)
  }, [loadData, workspace?.id, members])

  // ── Selected livreur ─────────────────────────────────────────────────────
  const selectedLivreur = livreurs.find(l => l.user_id === selectedId)
  const selectedDeliveries = selectedId ? (deliveriesByUser[selectedId] || []) : []

  const handleSelectLivreur = (userId) => {
    const pos = livreurs.find(l => l.user_id === userId)
    setSelectedId(prev => prev === userId ? null : userId)
    if (pos?.lat && pos?.lng) setFlyTo({ lat: pos.lat, lng: pos.lng })
    setPanelExpanded(true)
  }

  // Default map center: France
  const defaultCenter = [46.8, 2.35]
  const defaultZoom = 6
  const mapCenter = livreurs.find(l => l.isOnline && l.lat)
    ? [livreurs.find(l => l.isOnline && l.lat).lat, livreurs.find(l => l.isOnline && l.lat).lng]
    : defaultCenter

  const onlineCount = livreurs.filter(l => l.isOnline).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col bg-[#1a1a2e]" style={{ zIndex: 0 }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-[#040741]/95 backdrop-blur z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/livraisons')}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">Carte livraisons</h1>
            <p className="text-white/50 text-xs">
              {onlineCount > 0
                ? `${onlineCount} livreur${onlineCount > 1 ? 's' : ''} actif${onlineCount > 1 ? 's' : ''}`
                : 'Aucun livreur actif'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-white/40 text-xs hidden sm:block">
              Mis à jour {timeAgo(lastRefresh.toISOString())}
            </span>
          )}
          <button
            onClick={loadData}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"
            title="Actualiser"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        <MapContainer
          center={mapCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          />
          <MapController flyTo={flyTo} />

          {livreurs.map(l => l.lat && l.lng ? (
            <Marker
              key={l.user_id}
              position={[l.lat, l.lng]}
              icon={createVanIcon(l.heading, l.isMoving, l.isOnline)}
              eventHandlers={{ click: () => handleSelectLivreur(l.user_id) }}
            >
              <Popup className="dark-popup">
                <div className="p-1 min-w-[160px]">
                  <p className="font-bold text-[#040741] text-sm mb-1">{l.name}</p>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`w-2 h-2 rounded-full ${l.isOnline ? (l.isMoving ? 'bg-green-500' : 'bg-blue-500') : 'bg-gray-400'}`}/>
                    <span className="text-xs text-gray-600">
                      {!l.isOnline ? 'Hors ligne' : l.isMoving ? 'En route' : 'À l\'arrêt'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {deliveriesByUser[l.user_id]?.filter(d => d.status !== 'livree').length || 0} livraison(s) restante(s)
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Màj : {timeAgo(l.updated_at)}
                  </p>
                </div>
              </Popup>
            </Marker>
          ) : null)}
        </MapContainer>

        {/* Zoom controls custom */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1">
          <button
            onClick={() => {/* handled by leaflet */}}
            className="w-9 h-9 bg-white/90 hover:bg-white rounded-xl shadow-lg flex items-center justify-center text-[#040741] font-bold text-lg"
          >
            +
          </button>
          <button
            className="w-9 h-9 bg-white/90 hover:bg-white rounded-xl shadow-lg flex items-center justify-center text-[#040741] font-bold text-xl"
          >
            −
          </button>
        </div>
      </div>

      {/* Bottom panel – style Snapchat */}
      <div
        className={`flex-shrink-0 bg-white rounded-t-3xl shadow-2xl transition-all duration-300 ease-in-out overflow-hidden`}
        style={{ maxHeight: panelExpanded ? '55vh' : '160px' }}
      >
        {/* Handle */}
        <button
          className="w-full flex items-center justify-center pt-3 pb-1"
          onClick={() => setPanelExpanded(v => !v)}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </button>

        {/* Panel header */}
        <div className="px-4 pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#040741]">
              Livreurs
              {onlineCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  {onlineCount} actif{onlineCount > 1 ? 's' : ''}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={() => navigate('/livraisons')}
            className="text-xs text-[#313ADF] font-medium"
          >
            Gérer les livraisons →
          </button>
        </div>

        {/* Livreur cards – scroll horizontal */}
        <div className="px-4 pb-3">
          {livreurs.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-sm">
              Aucun livreur avec GPS actif
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
              {livreurs.map(l => {
                const userDeliveries = deliveriesByUser[l.user_id] || []
                const done = userDeliveries.filter(d => d.status === 'livree').length
                const total = userDeliveries.length
                const isSelected = selectedId === l.user_id
                return (
                  <button
                    key={l.user_id}
                    onClick={() => handleSelectLivreur(l.user_id)}
                    className={`flex-shrink-0 snap-start rounded-2xl border-2 transition-all p-3 text-left w-[140px]
                      ${isSelected
                        ? 'border-[#313ADF] bg-[#313ADF]/5 shadow-md'
                        : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                      }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0
                        ${!l.isOnline ? 'bg-gray-400' : l.isMoving ? 'bg-green-500' : 'bg-[#313ADF]'}`}>
                        {initials(l.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#040741] truncate">{l.name.split(' ')[0]}</p>
                        <div className="flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${l.isOnline ? (l.isMoving ? 'bg-green-500 animate-pulse' : 'bg-blue-400') : 'bg-gray-300'}`}/>
                          <span className="text-[10px] text-gray-500 truncate">
                            {!l.isOnline ? 'Hors ligne' : l.isMoving ? 'En route' : 'Arrêté'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {total > 0 ? (
                        <>
                          <span className="font-semibold text-[#040741]">{done}</span>/{total} livr.
                          {/* Mini progress bar */}
                          <div className="mt-1.5 h-1 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-green-500 transition-all"
                              style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
                            />
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-400">Aucune livraison</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Détail livreur sélectionné */}
        {selectedLivreur && panelExpanded && (
          <div className="px-4 pb-4 border-t border-gray-100 overflow-y-auto" style={{ maxHeight: '200px' }}>
            <div className="flex items-center gap-2 py-2.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white
                ${!selectedLivreur.isOnline ? 'bg-gray-400' : selectedLivreur.isMoving ? 'bg-green-500' : 'bg-[#313ADF]'}`}>
                {initials(selectedLivreur.name)}
              </div>
              <div>
                <p className="text-xs font-bold text-[#040741]">{selectedLivreur.name}</p>
                <p className="text-[10px] text-gray-400">
                  {!selectedLivreur.isOnline
                    ? `Dernière position: ${timeAgo(selectedLivreur.updated_at)}`
                    : selectedLivreur.isMoving
                      ? `En route · ${Math.round((selectedLivreur.speed || 0) * 3.6)} km/h`
                      : `À l'arrêt · Màj ${timeAgo(selectedLivreur.updated_at)}`
                  }
                </p>
              </div>
            </div>

            {selectedDeliveries.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Aucune livraison assignée</p>
            ) : (
              <div className="space-y-1.5">
                {selectedDeliveries.map(d => {
                  const c = d.order?.customers
                  const name = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : 'Client'
                  const dotCls = STATUS_DOT[d.status] || 'bg-gray-300'
                  return (
                    <div key={d.id} className="flex items-center gap-2.5 py-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`}/>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[#040741] truncate">{name}</p>
                        <p className="text-[10px] text-gray-400">
                          {d.order?.order_number}
                          {d.time_slot ? ` · ${d.time_slot}` : ''}
                          {d.scheduled_date ? ` · ${new Date(d.scheduled_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500 flex-shrink-0">{STATUS_LABEL[d.status] || d.status}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
