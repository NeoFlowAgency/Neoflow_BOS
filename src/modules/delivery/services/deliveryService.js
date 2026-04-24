// src/modules/delivery/services/deliveryService.js
import { supabase } from '../../../lib/supabase'

// Note: assigned_to est une FK vers auth.users(id), pas workspace_users.
const DELIVERY_SELECT = `
  *,
  order:orders(
    id, order_number, remaining_amount,
    old_furniture_option,
    customer:customers(id, first_name, last_name, phone, address),
    order_items(id, quantity, product:products(id, name))
  ),
  vehicle:delivery_vehicles(id, name)
`

export async function listDeliveries(workspaceId, filters = {}) {
  let q = supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .eq('workspace_id', workspaceId)
    .order('scheduled_date', { ascending: true })

  if (filters.status)   q = q.eq('status', filters.status)
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
  if (filters.date)     q = q.eq('scheduled_date', filters.date)
  if (filters.statuses) q = q.in('status', filters.statuses)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getDelivery(id) {
  const { data, error } = await supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updateDelivery(id, updates) {
  const { data, error } = await supabase
    .from('deliveries')
    .update(updates)
    .eq('id', id)
    .select(DELIVERY_SELECT)
    .single()
  if (error) throw error
  return data
}

export async function transitionDelivery(id, newStatus) {
  const timestamps = {
    en_route:    { departed_at: new Date().toISOString() },
    chez_client: { arrived_at_client_at: new Date().toISOString() },
    livree:      {},
    probleme:    { problem_reported_at: new Date().toISOString() },
  }
  return updateDelivery(id, { status: newStatus, ...(timestamps[newStatus] ?? {}) })
}

export async function confirmLoading(id) {
  return updateDelivery(id, { loading_confirmed_at: new Date().toISOString() })
}

export async function signDelivery(id, signatureUrl) {
  return updateDelivery(id, {
    signature_url: signatureUrl,
    signature_obtained_at: new Date().toISOString(),
  })
}

export async function reportProblem(id, type, description) {
  return updateDelivery(id, {
    status: 'probleme',
    problem_type: type,
    problem_description: description,
    problem_reported_at: new Date().toISOString(),
  })
}

export async function completeDelivery(id, { photoUrl, signatureUrl } = {}) {
  const updates = { status: 'livree' }
  if (photoUrl)     updates.proof_photo_url = photoUrl
  if (signatureUrl) updates.signature_url = signatureUrl
  return updateDelivery(id, updates)
}

export async function listVehicles(workspaceId) {
  const { data, error } = await supabase
    .from('delivery_vehicles')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name')
  if (error) throw error
  return data
}

export async function createVehicle(workspaceId, payload) {
  const { data, error } = await supabase
    .from('delivery_vehicles')
    .insert({ workspace_id: workspaceId, ...payload })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateVehicle(id, updates) {
  const { data, error } = await supabase
    .from('delivery_vehicles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteVehicle(id) {
  const { error } = await supabase.from('delivery_vehicles').delete().eq('id', id)
  if (error) throw error
}

export async function uploadDeliveryPhoto(deliveryId, file) {
  const ext = file.name.split('.').pop()
  const path = `delivery-photos/${deliveryId}/proof-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('deliveries').upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('deliveries').getPublicUrl(path)
  return publicUrl
}

export async function uploadSignature(deliveryId, dataUrl) {
  const blob = await fetch(dataUrl).then(r => r.blob())
  const path = `delivery-signatures/${deliveryId}/signature.png`
  const { error } = await supabase.storage.from('deliveries').upload(path, blob, {
    contentType: 'image/png',
    upsert: true,
  })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('deliveries').getPublicUrl(path)
  return publicUrl
}
