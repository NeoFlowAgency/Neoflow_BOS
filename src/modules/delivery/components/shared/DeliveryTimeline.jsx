// src/modules/delivery/components/shared/DeliveryTimeline.jsx
function fmt(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const STEPS = [
  { key: 'loading_confirmed_at', label: 'Chargement confirmé' },
  { key: 'departed_at',          label: 'Départ' },
  { key: 'arrived_at_client_at', label: 'Arrivée client' },
  { key: 'signature_obtained_at', label: 'Signature' },
]

export default function DeliveryTimeline({ delivery }) {
  return (
    <ol className="relative border-l border-gray-200 space-y-4 pl-4">
      {STEPS.map(step => {
        const time = fmt(delivery[step.key])
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 ${
              time ? 'bg-[#313ADF] border-[#313ADF]' : 'bg-white border-gray-300'
            }`} />
            <span className={`text-sm ${time ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
              {step.label}
            </span>
            {time && <span className="ml-auto text-xs text-gray-500">{time}</span>}
          </li>
        )
      })}
    </ol>
  )
}
