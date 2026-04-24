// src/modules/delivery/components/manager/FleetPanel.jsx
import { useState, useEffect } from 'react'
import { listVehicles, createVehicle, updateVehicle, deleteVehicle } from '../../services/deliveryService'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'

function VehicleForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    capacity_items: initial?.capacity_items ?? '',
    notes: initial?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        capacity_items: form.capacity_items ? parseInt(form.capacity_items) : null,
        notes: form.notes.trim() || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
      <input
        placeholder="Nom du véhicule (ex: Camion 1)"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#313ADF]"
      />
      <input
        type="number"
        placeholder="Capacité (nb articles max)"
        value={form.capacity_items}
        onChange={e => setForm(f => ({ ...f, capacity_items: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#313ADF]"
      />
      <textarea
        placeholder="Notes (optionnel)"
        value={form.notes}
        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#313ADF]"
      />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 text-sm">
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim()}
          className="flex-1 py-2 bg-[#313ADF] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

export default function FleetPanel({ workspaceId }) {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await listVehicles(workspaceId)
      setVehicles(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (workspaceId) load() }, [workspaceId])

  const handleCreate = async (data) => {
    await createVehicle(workspaceId, data)
    setShowForm(false)
    load()
  }

  const handleUpdate = async (id, data) => {
    await updateVehicle(id, data)
    setEditingId(null)
    load()
  }

  const handleToggle = async (vehicle) => {
    await updateVehicle(vehicle.id, { available: !vehicle.available })
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce véhicule ?')) return
    await deleteVehicle(id)
    load()
  }

  if (loading) return <p className="text-gray-400 text-sm">Chargement…</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{vehicles.length} véhicule{vehicles.length !== 1 ? 's' : ''}</h3>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#313ADF] text-white rounded-lg text-sm font-medium"
        >
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {showForm && (
        <VehicleForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      <div className="space-y-2">
        {vehicles.length === 0 && !showForm && (
          <p className="text-gray-400 text-sm text-center py-8">Aucun véhicule configuré.</p>
        )}
        {vehicles.map(v => (
          <div key={v.id}>
            {editingId === v.id ? (
              <VehicleForm
                initial={v}
                onSave={(data) => handleUpdate(v.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-200">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 text-sm">{v.name}</p>
                  {v.capacity_items && (
                    <p className="text-xs text-gray-500">Capacité : {v.capacity_items} articles</p>
                  )}
                  {v.notes && <p className="text-xs text-gray-400 mt-0.5">{v.notes}</p>}
                </div>
                {/* Toggle disponible */}
                <button
                  onClick={() => handleToggle(v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${v.available ? 'bg-[#313ADF]' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${v.available ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <button onClick={() => setEditingId(v.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
