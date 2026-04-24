// src/modules/delivery/components/manager/DeliveryCalendar.jsx
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import DeliveryStatusBadge from '../shared/DeliveryStatusBadge'

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

function fmt(date) {
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function DeliveryCalendar({ deliveries, onOpenDelivery, selectedDate, onDateChange }) {
  const [view, setView] = useState('week') // 'week' | 'month'
  const [weekStart, setWeekStart] = useState(() => startOfWeek(selectedDate ?? new Date()))

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const byDay = useMemo(() => {
    const map = {}
    deliveries.forEach(d => {
      const key = d.scheduled_date ?? d.created_at?.split('T')[0]
      if (!key) return
      if (!map[key]) map[key] = []
      map[key].push(d)
    })
    return map
  }, [deliveries])

  const prevWeek = () => setWeekStart(w => addDays(w, -7))
  const nextWeek = () => setWeekStart(w => addDays(w, 7))

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Barre navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex gap-1">
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'week' ? 'bg-[#313ADF] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Semaine
          </button>
          <button
            onClick={() => setView('month')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'month' ? 'bg-[#313ADF] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Mois
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium text-gray-700">
            {fmt(weekStart)} — {fmt(addDays(weekStart, 6))}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Grille 7 colonnes */}
      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {days.map(day => {
          const key = toDateStr(day)
          const isToday = key === toDateStr(new Date())
          const list = byDay[key] ?? []
          return (
            <div key={key} className={`min-h-[140px] p-2 ${isToday ? 'bg-blue-50/50' : ''}`}>
              <p className={`text-xs font-medium mb-2 ${isToday ? 'text-[#313ADF]' : 'text-gray-500'}`}>
                {day.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
              </p>
              <div className="space-y-1">
                {list.map(d => (
                  <button
                    key={d.id}
                    onClick={() => onOpenDelivery?.(d)}
                    className="w-full text-left"
                  >
                    <div className={`rounded px-1.5 py-1 text-xs truncate font-medium
                      ${d.status === 'livree' ? 'bg-green-100 text-green-700'
                        : d.status === 'probleme' ? 'bg-red-100 text-red-700'
                        : d.status === 'en_route' || d.status === 'chez_client' ? 'bg-amber-100 text-amber-700'
                        : 'bg-[#313ADF]/10 text-[#313ADF]'}`}
                    >
                      {d.order?.customer?.last_name ?? 'Client'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
