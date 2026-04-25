// src/modules/delivery/hooks/useDeliveryAlerts.js
import { useMemo } from 'react'
import { haversine } from './useDriverLocation'

export function useDeliveryAlerts(deliveries, driverPositions, thresholdDays = 3) {
  const alerts = useMemo(() => {
    const result = []
    const now = Date.now()
    const TEN_MIN = 10 * 60 * 1000

    deliveries.forEach(delivery => {
      if (delivery.status === 'a_planifier') {
        const created = new Date(delivery.created_at).getTime()
        const days = (now - created) / (1000 * 60 * 60 * 24)
        if (days >= thresholdDays) {
          result.push({
            type: 'unplanned',
            delivery,
            message: `Non planifiée depuis ${Math.floor(days)} jours`,
          })
        }
      }

      if (delivery.status === 'en_route' && delivery.assigned_to) {
        const pos = driverPositions[delivery.assigned_to]
        if (!pos) return

        const lastUpdate = new Date(pos.recorded_at).getTime()
        const isStale = (now - lastUpdate) > TEN_MIN
        const isStationary = !pos.is_moving

        if (isStale && isStationary) {
          const client = delivery.order?.customer
          if (client?.lat && client?.lng && pos.lat && pos.lng) {
            const dist = haversine(
              { lat: pos.lat, lng: pos.lng },
              { lat: client.lat, lng: client.lng }
            )
            if (dist > 0.5) {
              result.push({
                type: 'stuck',
                delivery,
                driverId: delivery.assigned_to,
                message: `Livreur immobile depuis > 10 min à ${(dist * 1000).toFixed(0)}m du client`,
              })
            }
          }
        }
      }
    })

    return result
  }, [deliveries, driverPositions, thresholdDays])

  return alerts
}
