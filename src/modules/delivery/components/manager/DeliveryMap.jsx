// src/modules/delivery/components/manager/DeliveryMap.jsx
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet'
import { useWatchDrivers, haversine } from '../../hooks/useDriverLocation'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix Leaflet default marker icons (manquants dans Vite/webpack sans copy)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const STATUS_COLOR = {
  chez_client: '#F59E0B',
  en_route:    '#313ADF',
  default:     '#10B981',
}

export default function DeliveryMap({ workspaceId, deliveries, workspaceMembers = [] }) {
  const driverPositions = useWatchDrivers(workspaceId)
  const center = [47.218, -1.554] // Nantes / Rezé par défaut

  const activeDrivers = Object.entries(driverPositions)
  const deliveriesWithCoords = deliveries.filter(d => d.delivery_lat && d.delivery_lng)
  const hasActivity = activeDrivers.length > 0 || deliveriesWithCoords.length > 0

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <MapContainer center={center} zoom={11} className="w-full h-full" scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />

        {/* Adresses de livraison du jour */}
        {deliveriesWithCoords.map(d => (
          <CircleMarker
            key={d.id}
            center={[d.delivery_lat, d.delivery_lng]}
            radius={8}
            pathOptions={{ color: '#313ADF', fillColor: '#313ADF', fillOpacity: 0.3 }}
          >
            <Popup>
              <strong>{d.order?.customer?.first_name} {d.order?.customer?.last_name}</strong><br />
              {d.delivery_address}<br />
              <span style={{ fontSize: '11px', color: '#6B7280' }}>{d.time_slot}</span>
            </Popup>
          </CircleMarker>
        ))}

        {/* Positions livreurs en temps réel */}
        {activeDrivers.map(([driverId, pos]) => {
          const member = workspaceMembers.find(m => m.user_id === driverId)
          const delivery = deliveries.find(d => d.id === pos.delivery_id)
          let etaText = null
          if (delivery?.delivery_lat && pos.lat) {
            const distKm = haversine(
              { lat: pos.lat, lng: pos.lng },
              { lat: delivery.delivery_lat, lng: delivery.delivery_lng }
            )
            const etaMin = Math.round((distKm / 30) * 60)
            etaText = `ETA ~${etaMin} min`
          }

          return (
            <Marker key={driverId} position={[pos.lat, pos.lng]}>
              <Popup>
                <strong>{member?.profile?.full_name ?? 'Livreur'}</strong><br />
                {pos.is_moving ? '● En mouvement' : '● Arrêté'}<br />
                {etaText && <span style={{ fontSize: '12px', color: '#313ADF', fontWeight: 600 }}>{etaText}</span>}
                {etaText && <br />}
                <span style={{ fontSize: '11px', color: '#6B7280' }}>
                  Mis à jour {new Date(pos.recorded_at).toLocaleTimeString('fr-FR')}
                </span>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Barre de statut flottante — toujours visible en bas de la carte */}
      <div className="absolute bottom-4 left-4 right-4 z-[1000] pointer-events-none">
        {hasActivity ? (
          <div className="flex items-center gap-3 flex-wrap">
            {activeDrivers.length > 0 && (
              <div className="bg-white/95 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-lg border border-gray-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"></span>
                <span className="text-sm font-semibold text-[#040741]">
                  {activeDrivers.length} livreur{activeDrivers.length > 1 ? 's' : ''} actif{activeDrivers.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
            {deliveriesWithCoords.length > 0 && (
              <div className="bg-white/95 backdrop-blur-sm rounded-xl px-4 py-2.5 shadow-lg border border-gray-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#313ADF] flex-shrink-0"></span>
                <span className="text-sm font-medium text-gray-600">
                  {deliveriesWithCoords.length} livraison{deliveriesWithCoords.length > 1 ? 's' : ''} géolocalisée{deliveriesWithCoords.length > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        ) : (
          /* Empty state flottant sur la carte */
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 shadow-xl border border-gray-100 max-w-sm mx-auto text-center">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="font-semibold text-[#040741] text-sm">Aucun livreur connecté</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Les livreurs apparaissent ici dès qu'ils démarrent leur application et activent leur tournée.
            </p>
            {deliveries.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-[#313ADF] font-medium">
                  {deliveries.length} livraison{deliveries.length > 1 ? 's' : ''} planifiée{deliveries.length > 1 ? 's' : ''} ce jour
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
