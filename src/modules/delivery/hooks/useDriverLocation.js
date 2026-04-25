// src/modules/delivery/hooks/useDriverLocation.js
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

const GPS_COOLDOWN_MS = 15_000 // 1 insert max toutes les 15 secondes

export function useShareLocation(workspaceId, driverId, deliveryId, active) {
  const watchRef = useRef(null)
  const prevPos = useRef(null)
  const lastInsertRef = useRef(0)

  const stop = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active || !workspaceId || !driverId) return stop()

    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now()
        if (now - lastInsertRef.current < GPS_COOLDOWN_MS) return
        lastInsertRef.current = now

        const { latitude: lat, longitude: lng } = pos.coords
        const isMoving = prevPos.current
          ? haversine(prevPos.current, { lat, lng }) > 0.01
          : false

        prevPos.current = { lat, lng }

        await supabase.from('delivery_driver_locations').insert({
          workspace_id: workspaceId,
          driver_id: driverId,
          delivery_id: deliveryId ?? null,
          lat,
          lng,
          heading: pos.coords.heading ?? 0,
          is_moving: isMoving,
        })
      },
      (err) => console.warn('[GPS]', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )

    return stop
  }, [active, workspaceId, driverId, deliveryId])

  return { stop }
}

export function useWatchDrivers(workspaceId) {
  const [positions, setPositions] = useState({})

  useEffect(() => {
    if (!workspaceId) return

    const loadCurrent = async () => {
      const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('delivery_driver_locations')
        .select('*')
        .eq('workspace_id', workspaceId)
        .gte('recorded_at', cutoff)
        .order('recorded_at', { ascending: false })

      if (data) {
        const map = {}
        data.forEach(row => {
          if (!map[row.driver_id]) map[row.driver_id] = row
        })
        setPositions(map)
      }
    }

    loadCurrent()

    const channel = supabase
      .channel(`driver-locations-${workspaceId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'delivery_driver_locations',
        filter: `workspace_id=eq.${workspaceId}`,
      }, ({ new: row }) => {
        setPositions(prev => ({ ...prev, [row.driver_id]: row }))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [workspaceId])

  return positions
}

export function haversine(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(s))
}
