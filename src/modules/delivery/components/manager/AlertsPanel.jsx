// src/modules/delivery/components/manager/AlertsPanel.jsx
import { AlertTriangle, Clock, CheckCircle } from 'lucide-react'

export default function AlertsPanel({ alerts = [], onSelectDelivery }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
        <CheckCircle size={20} className="text-green-500 shrink-0" />
        <p className="text-green-700 text-sm font-medium">Toutes les livraisons sont sous contrôle.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => {
        const isStuck = alert.type === 'stuck'
        const customer = alert.delivery?.order?.customer
        return (
          <button
            key={idx}
            onClick={() => onSelectDelivery?.(alert.delivery)}
            className={`w-full text-left flex items-start gap-3 rounded-xl p-4 border transition-colors
              ${isStuck
                ? 'bg-red-50 border-red-200 hover:bg-red-100'
                : 'bg-orange-50 border-orange-200 hover:bg-orange-100'}`}
          >
            <AlertTriangle size={18} className={isStuck ? 'text-red-500 shrink-0 mt-0.5' : 'text-orange-500 shrink-0 mt-0.5'} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${isStuck ? 'text-red-800' : 'text-orange-800'}`}>
                {isStuck ? '🔴 Livreur bloqué' : '🟡 Non planifiée'}
              </p>
              {customer && (
                <p className="text-xs mt-0.5 text-gray-700 truncate">
                  {customer.first_name} {customer.last_name}
                </p>
              )}
              <p className={`text-xs mt-1 ${isStuck ? 'text-red-600' : 'text-orange-600'}`}>
                {alert.message}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
