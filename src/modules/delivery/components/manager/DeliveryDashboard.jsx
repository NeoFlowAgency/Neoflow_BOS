// src/modules/delivery/components/manager/DeliveryDashboard.jsx
import { useMemo } from 'react'
import { Package, Truck, CheckCircle, AlertTriangle, Users } from 'lucide-react'

export default function DeliveryDashboard({ deliveries, driverPositions = {}, alerts = [] }) {
  const stats = useMemo(() => {
    const total = deliveries.length
    const done = deliveries.filter(d => d.status === 'livree').length
    const inProgress = deliveries.filter(d => ['en_route', 'chez_client'].includes(d.status)).length
    const problems = deliveries.filter(d => d.status === 'probleme').length
    const activeDrivers = Object.keys(driverPositions).filter(driverId => {
      const pos = driverPositions[driverId]
      return pos && (Date.now() - new Date(pos.recorded_at).getTime()) < 5 * 60 * 1000
    }).length
    const unplanned = alerts.filter(a => a.type === 'unplanned').length
    const stuck = alerts.filter(a => a.type === 'stuck').length
    return { total, done, inProgress, problems, activeDrivers, unplanned, stuck }
  }, [deliveries, driverPositions, alerts])

  const cards = [
    {
      label: 'Total du jour',
      value: stats.total,
      icon: Package,
      color: 'text-[#313ADF]',
      bg: 'bg-blue-50',
    },
    {
      label: 'Terminées',
      value: stats.done,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'En cours',
      value: stats.inProgress,
      icon: Truck,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Problèmes',
      value: stats.problems,
      icon: AlertTriangle,
      color: stats.problems > 0 ? 'text-red-600' : 'text-gray-400',
      bg: stats.problems > 0 ? 'bg-red-50' : 'bg-gray-50',
    },
    {
      label: 'Livreurs actifs',
      value: stats.activeDrivers,
      icon: Users,
      color: 'text-[#313ADF]',
      bg: 'bg-blue-50',
    },
    {
      label: 'Non planifiées',
      value: stats.unplanned,
      icon: AlertTriangle,
      color: stats.unplanned > 0 ? 'text-orange-600' : 'text-gray-400',
      bg: stats.unplanned > 0 ? 'bg-orange-50' : 'bg-gray-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map(card => (
        <div key={card.label} className={`rounded-xl p-4 ${card.bg} flex flex-col gap-2`}>
          <card.icon size={20} className={card.color} />
          <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          <p className="text-xs text-gray-600 leading-tight">{card.label}</p>
        </div>
      ))}
    </div>
  )
}
