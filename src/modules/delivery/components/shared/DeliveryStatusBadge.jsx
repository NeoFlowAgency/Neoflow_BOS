// src/modules/delivery/components/shared/DeliveryStatusBadge.jsx
const CONFIG = {
  a_planifier: { label: 'À planifier',    bg: 'bg-gray-100',   text: 'text-gray-700'   },
  planifiee:   { label: 'Planifiée',      bg: 'bg-blue-100',   text: 'text-blue-700'   },
  en_route:    { label: 'En route',       bg: 'bg-amber-100',  text: 'text-amber-700'  },
  chez_client: { label: 'Chez le client', bg: 'bg-orange-100', text: 'text-orange-700' },
  livree:      { label: 'Livrée',         bg: 'bg-green-100',  text: 'text-green-700'  },
  probleme:    { label: 'Problème',       bg: 'bg-red-100',    text: 'text-red-700'    },
}

export default function DeliveryStatusBadge({ status, size = 'sm' }) {
  const cfg = CONFIG[status] ?? CONFIG.a_planifier
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${padding} ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}
