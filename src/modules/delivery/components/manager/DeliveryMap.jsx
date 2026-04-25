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

function driverColor(position, deliveries) {
  const delivery = deliveries.find(d => d.id === position.delivery_id)
  if (!delivery) return '#6B7280'
  if (delivery.status === 'chez_client') return '#F59E0B'
  if (delivery.status === 'en_route')    return '#313ADF'
  return '#10B981'
}

export default function DeliveryMap({ workspaceId, deliveries, workspaceMembers = [] }) {
  const driverPositions = useWatchDrivers(workspaceId)
  const center = [47.218, -1.554] // Nantes / Rezé par défaut

  return (
    <MapContainer center={center} zoom={11} className="w-full h-full rounded-xl" scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />

      {/* Adresses de livraison du jour */}
      {deliveries.filter(d => d.delivery_lat && d.delivery_lng).map(d => (
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
      {Object.entries(driverPositions).map(([driverId, pos]) => {
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
              {pos.is_moving ? '🟢 En mouvement' : '🔵 Arrêté'}<br />
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
  )
}
