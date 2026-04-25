// src/modules/delivery/components/driver/DriverHome.jsx
import DeliveryStatusBadge from '../shared/DeliveryStatusBadge'
import { MapPin, Clock, Package, ChevronRight } from 'lucide-react'

function formatDate(d) {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function shortProductList(orderItems) {
  if (!orderItems?.length) return null
  const first = orderItems[0]?.product?.name ?? 'Article'
  const rest = orderItems.length - 1
  return rest > 0 ? `${first} +${rest} autre${rest > 1 ? 's' : ''}` : first
}

export default function DriverHome({ deliveries, tourneeActive, onStartTournee, onStopTournee, onOpenDelivery }) {
  const today = new Date()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <div className="bg-[#040741] text-white px-4 pt-8 pb-6">
        <p className="text-sm text-blue-200 capitalize">{formatDate(today)}</p>
        <h1 className="text-2xl font-bold mt-1">Ma journée</h1>
        <p className="text-blue-200 text-sm mt-1">
          {deliveries.length} livraison{deliveries.length !== 1 ? 's' : ''} aujourd&apos;hui
        </p>
      </div>

      {/* Bouton tournée */}
      <div className="px-4 -mt-3">
        {tourneeActive ? (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-green-700 font-medium text-sm">🟢 GPS actif — Tournée en cours</span>
            <button
              onClick={onStopTournee}
              className="text-xs text-green-600 underline"
            >
              Terminer
            </button>
          </div>
        ) : (
          <button
            onClick={onStartTournee}
            className="w-full py-4 bg-[#313ADF] text-white rounded-xl font-semibold text-base shadow-lg active:bg-[#2830c0]"
          >
            Démarrer ma tournée
          </button>
        )}
      </div>

      {/* Liste livraisons */}
      <div className="px-4 mt-4 space-y-3 pb-8">
        {deliveries.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">🎉</p>
            <p className="font-medium">Aucune livraison aujourd&apos;hui</p>
          </div>
        ) : (
          deliveries.map((delivery, idx) => {
            const customer = delivery.order?.customer
            const remaining = delivery.order?.remaining_amount
            const isReprise = delivery.order?.old_furniture_option === 'reprise'
            const products = shortProductList(delivery.order?.order_items)

            return (
              <div key={delivery.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* En-tête carte */}
                <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                  <span className="w-7 h-7 rounded-full bg-[#313ADF] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {customer?.first_name} {customer?.last_name}
                    </p>
                    {customer?.address && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin size={11} /> {customer.address}
                      </p>
                    )}
                  </div>
                  <DeliveryStatusBadge status={delivery.status} />
                </div>

                {/* Infos */}
                <div className="px-4 pb-3 space-y-1">
                  {delivery.time_slot && (
                    <p className="text-sm text-gray-600 flex items-center gap-1.5">
                      <Clock size={13} className="text-gray-400" />
                      {delivery.time_slot}
                    </p>
                  )}
                  {products && (
                    <p className="text-sm text-gray-600 flex items-center gap-1.5">
                      <Package size={13} className="text-gray-400" />
                      {products}
                    </p>
                  )}
                  {/* Badges */}
                  <div className="flex gap-2 pt-1 flex-wrap">
                    {isReprise && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                        Reprise
                      </span>
                    )}
                    {remaining > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                        Reste {remaining.toFixed(2)} €
                      </span>
                    )}
                  </div>
                </div>

                {/* Bouton */}
                <button
                  onClick={() => onOpenDelivery(delivery)}
                  className="w-full py-3.5 border-t border-gray-100 flex items-center justify-center gap-2
                             text-[#313ADF] font-semibold text-sm active:bg-gray-50"
                >
                  Commencer <ChevronRight size={16} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
