// src/modules/delivery/hooks/useDeliveries.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { listDeliveries } from '../services/deliveryService'

export function useDeliveries(workspaceId, filters = {}) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const statusKey   = filters.status    ?? ''
  const assignedKey = filters.assignedTo ?? ''
  const dateKey     = filters.date      ?? ''
  const statusesKey = (filters.statuses ?? []).join(',')

  const load = useCallback(async () => {
    if (!workspaceId) return
    try {
      setLoading(true)
      setError(null)
      const data = await listDeliveries(workspaceId, filters)
      setDeliveries(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, statusKey, assignedKey, dateKey, statusesKey])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!workspaceId) return
    const channel = supabase
      .channel(`deliveries-${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deliveries',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [workspaceId, load])

  return { deliveries, loading, error, refresh: load }
}
