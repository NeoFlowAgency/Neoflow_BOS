// src/modules/delivery/pages/DeliveryManagerPage.jsx
import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { useDeliveries } from '../hooks/useDeliveries'
import { useWatchDrivers } from '../hooks/useDriverLocation'
import { useDeliveryAlerts } from '../hooks/useDeliveryAlerts'
import DeliveryDashboard from '../components/manager/DeliveryDashboard'
import DeliveryBoard from '../components/manager/DeliveryBoard'
import DeliveryCalendar from '../components/manager/DeliveryCalendar'
import DeliveryMap from '../components/manager/DeliveryMap'
import FleetPanel from '../components/manager/FleetPanel'
import AlertsPanel from '../components/manager/AlertsPanel'

const TABS = [
  { key: 'dashboard',    label: 'Tableau de bord' },
  { key: 'planning',     label: 'Planification'   },
  { key: 'map',          label: 'Carte GPS'        },
  { key: 'fleet',        label: 'Flotte'           },
]

export default function DeliveryManagerPage() {
  const { workspace, role } = useWorkspace()
  const [tab, setTab] = useState('dashboard')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [workspaceMembers, setWorkspaceMembers] = useState([])

  // Guard rôle
  if (!['proprietaire', 'manager'].includes(role)) {
    return <Navigate to="/livraisons/ma-tournee" replace />
  }

  const { deliveries, refresh } = useDeliveries(workspace?.id, { date: selectedDate })
  const driverPositions = useWatchDrivers(workspace?.id)
  const alerts = useDeliveryAlerts(deliveries, driverPositions)

  // Charger les membres du workspace
  useEffect(() => {
    if (!workspace?.id) return
    supabase
      .from('workspace_users')
      .select('user_id, role, profile:profiles(full_name)')
      .eq('workspace_id', workspace.id)
      .then(({ data }) => setWorkspaceMembers(data ?? []))
  }, [workspace?.id])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <div className="bg-[#040741] text-white px-6 pt-8 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Livraisons</h1>
            <p className="text-blue-200 text-sm mt-0.5">
              {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/60"
          />
        </div>

        {/* Onglets */}
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors
                ${tab === t.key
                  ? 'bg-gray-50 text-[#313ADF]'
                  : 'text-blue-200 hover:text-white'}`}
            >
              {t.label}
              {t.key === 'dashboard' && alerts.length > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {alerts.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Corps */}
      <div className="px-6 py-6">
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <DeliveryDashboard
              deliveries={deliveries}
              driverPositions={driverPositions}
              alerts={alerts}
            />
            <div>
              <h2 className="font-semibold text-gray-900 mb-3">Alertes</h2>
              <AlertsPanel alerts={alerts} onSelectDelivery={() => setTab('planning')} />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 mb-3">Calendrier</h2>
              <DeliveryCalendar
                deliveries={deliveries}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
              />
            </div>
          </div>
        )}

        {tab === 'planning' && (
          <DeliveryBoard
            workspaceId={workspace?.id}
            deliveries={deliveries}
            workspaceMembers={workspaceMembers}
            onRefresh={refresh}
          />
        )}

        {tab === 'map' && (
          <div style={{ height: '600px' }}>
            <DeliveryMap
              workspaceId={workspace?.id}
              deliveries={deliveries}
              workspaceMembers={workspaceMembers}
            />
          </div>
        )}

        {tab === 'fleet' && (
          <FleetPanel workspaceId={workspace?.id} />
        )}
      </div>
    </div>
  )
}
