// src/modules/delivery/pages/DriverPage.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { useDeliveries } from '../hooks/useDeliveries'
import { useShareLocation } from '../hooks/useDriverLocation'
import DriverHome from '../components/driver/DriverHome'
import DeliveryWorkflow from '../components/driver/DeliveryWorkflow'

export default function DriverPage() {
  const { workspace } = useWorkspace()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [tourneeActive, setTourneeActive] = useState(false)
  const [activeDelivery, setActiveDelivery] = useState(null)

  // Charger l'ID du livreur connecté
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null)
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const { deliveries, refresh } = useDeliveries(workspace?.id, {
    assignedTo: currentUserId,
    date: today,
  })

  // GPS actif uniquement si tournée démarrée
  useShareLocation(workspace?.id, currentUserId, activeDelivery?.id ?? null, tourneeActive)

  if (activeDelivery) {
    return (
      <DeliveryWorkflow
        delivery={activeDelivery}
        onClose={() => { setActiveDelivery(null); refresh() }}
        workspaceId={workspace?.id}
      />
    )
  }

  return (
    <DriverHome
      deliveries={deliveries}
      tourneeActive={tourneeActive}
      onStartTournee={() => setTourneeActive(true)}
      onStopTournee={() => setTourneeActive(false)}
      onOpenDelivery={setActiveDelivery}
    />
  )
}
