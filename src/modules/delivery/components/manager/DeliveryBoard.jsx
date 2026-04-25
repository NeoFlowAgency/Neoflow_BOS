// src/modules/delivery/components/manager/DeliveryBoard.jsx
import { useState, useEffect, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { transitionDelivery, updateDelivery, listVehicles } from '../../services/deliveryService'
import DeliveryStatusBadge from '../shared/DeliveryStatusBadge'
import { Calendar, Clock, Truck, User, X, Check } from 'lucide-react'

const COLUMNS = [
  { key: 'a_planifier',  label: 'À planifier',    color: 'bg-gray-100 text-gray-700'    },
  { key: 'planifiee',    label: 'Planifiée',       color: 'bg-blue-100 text-blue-700'    },
  { key: 'en_route',     label: 'En route',        color: 'bg-amber-100 text-amber-700'  },
  { key: 'chez_client',  label: 'Chez le client',  color: 'bg-orange-100 text-orange-700'},
  { key: 'livree',       label: 'Livrée',          color: 'bg-green-100 text-green-700'  },
  { key: 'probleme',     label: '⚠️ Problème',     color: 'bg-red-100 text-red-700'      },
]

function DeliveryCard({ delivery, onClick }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: delivery.id })
  const customer = delivery.order?.customer
  const isReprise = delivery.order?.old_furniture_option === 'reprise'
  const remaining = delivery.order?.remaining_amount

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-3 space-y-2 cursor-pointer
        hover:border-[#313ADF]/40 hover:shadow-sm transition-all select-none
        ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-900 text-sm leading-tight">
          {customer?.first_name} {customer?.last_name}
        </p>
        <DeliveryStatusBadge status={delivery.status} />
      </div>
      {customer?.address && (
        <p className="text-xs text-gray-500 truncate">{customer.address}</p>
      )}
      {delivery.time_slot && (
        <p className="text-xs text-gray-600 flex items-center gap-1">
          <Clock size={11} /> {delivery.time_slot}
        </p>
      )}
      <div className="flex gap-1.5 flex-wrap">
        {isReprise && (
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">Reprise</span>
        )}
        {remaining > 0 && (
          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
            {remaining.toFixed(0)} € à encaisser
          </span>
        )}
      </div>
    </div>
  )
}

function KanbanColumn({ column, deliveries, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })

  return (
    <div className="flex flex-col min-w-[220px] flex-1">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl ${column.color}`}>
        <span className="text-xs font-semibold">{column.label}</span>
        <span className="ml-auto text-xs font-bold opacity-70">{deliveries.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[300px] p-2 space-y-2 rounded-b-xl border border-t-0 border-gray-200 transition-colors
          ${isOver ? 'bg-[#313ADF]/5' : 'bg-gray-50'}`}
      >
        {deliveries.map(d => (
          <DeliveryCard key={d.id} delivery={d} onClick={() => onCardClick(d)} />
        ))}
      </div>
    </div>
  )
}

function AssignModal({ delivery, vehicles, workspaceMembers, onSave, onClose }) {
  const [form, setForm] = useState({
    assigned_to: delivery.assigned_to ?? '',
    vehicle_id: delivery.vehicle_id ?? '',
    scheduled_date: delivery.scheduled_date ?? new Date().toISOString().split('T')[0],
    time_slot: delivery.time_slot ?? '',
    pickup_location: delivery.pickup_location ?? 'store',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDelivery(delivery.id, {
        assigned_to: form.assigned_to || null,
        vehicle_id: form.vehicle_id || null,
        scheduled_date: form.scheduled_date || null,
        time_slot: form.time_slot || null,
        pickup_location: form.pickup_location,
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900">
            Planifier — {delivery.order?.customer?.first_name} {delivery.order?.customer?.last_name}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {/* Livreur */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Livreur assigné</label>
            <select
              value={form.assigned_to}
              onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#313ADF]"
            >
              <option value="">— Choisir un livreur</option>
              {workspaceMembers.filter(m => ['livreur', 'vendeur', 'manager', 'proprietaire'].includes(m.role)).map(m => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name ?? m.user_id}
                </option>
              ))}
            </select>
          </div>

          {/* Véhicule */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Véhicule</label>
            <select
              value={form.vehicle_id}
              onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#313ADF]"
            >
              <option value="">— Choisir un véhicule</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.available ? '' : ' (indispo)'}</option>
              ))}
            </select>
          </div>

          {/* Date + créneau */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Date</label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#313ADF]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Créneau</label>
              <input
                type="text"
                placeholder="ex: 9h-12h"
                value={form.time_slot}
                onChange={e => setForm(f => ({ ...f, time_slot: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#313ADF]"
              />
            </div>
          </div>

          {/* Lieu chargement */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Lieu de chargement</label>
            <div className="flex gap-2">
              {['store', 'depot'].map(loc => (
                <button
                  key={loc}
                  onClick={() => setForm(f => ({ ...f, pickup_location: loc }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors
                    ${form.pickup_location === loc ? 'border-[#313ADF] bg-[#313ADF]/5 text-[#313ADF]' : 'border-gray-200 text-gray-600'}`}
                >
                  {loc === 'store' ? 'Magasin' : 'Dépôt'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-600 text-sm">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-[#313ADF] text-white rounded-xl text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeliveryBoard({ workspaceId, deliveries, workspaceMembers = [], onRefresh }) {
  const [activeId, setActiveId] = useState(null)
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [vehicles, setVehicles] = useState([])

  useEffect(() => {
    if (workspaceId) listVehicles(workspaceId).then(setVehicles).catch(() => {})
  }, [workspaceId])

  const grouped = useMemo(() => {
    const map = {}
    COLUMNS.forEach(c => { map[c.key] = [] })
    deliveries.forEach(d => {
      if (map[d.status]) map[d.status].push(d)
    })
    return map
  }, [deliveries])

  const activeDelivery = useMemo(() => deliveries.find(d => d.id === activeId), [deliveries, activeId])

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null)
    if (!over || active.id === over.id) return
    const newStatus = over.id
    if (!COLUMNS.find(c => c.key === newStatus)) return
    const delivery = deliveries.find(d => d.id === active.id)
    if (!delivery || delivery.status === newStatus) return
    try {
      await transitionDelivery(active.id, newStatus)
      onRefresh?.()
    } catch (e) {
      console.error('[DeliveryBoard] transition échouée', e)
    }
  }

  return (
    <div className="space-y-4">
      <DndContext
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.key}
              column={col}
              deliveries={grouped[col.key] ?? []}
              onCardClick={setSelectedDelivery}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDelivery ? (
            <div className="bg-white rounded-xl border-2 border-[#313ADF] p-3 shadow-xl opacity-90 w-[220px]">
              <p className="font-semibold text-sm text-gray-900">
                {activeDelivery.order?.customer?.first_name} {activeDelivery.order?.customer?.last_name}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedDelivery && (
        <AssignModal
          delivery={selectedDelivery}
          vehicles={vehicles}
          workspaceMembers={workspaceMembers}
          onSave={() => { setSelectedDelivery(null); onRefresh?.() }}
          onClose={() => setSelectedDelivery(null)}
        />
      )}
    </div>
  )
}
