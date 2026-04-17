import { supabase } from '../lib/supabase'

const CONTREMARQUE_SELECT = `
  id, status, expected_date, received_date, notes, created_at, updated_at,
  order_id, order_item_id, supplier_id,
  supplier:suppliers(id, name),
  order_item:order_items(
    id, description, quantity,
    product:products(id, name, reference),
    variant:product_variants(id, size, comfort)
  )
`

/**
 * Liste les contremarques d'une commande
 */
export async function listContremarquesByOrder(orderId) {
  const { data, error } = await supabase
    .from('contremarques')
    .select(CONTREMARQUE_SELECT)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Liste les contremarques d'un workspace (filtrées par statut optionnel)
 * Inclut les infos commande + client pour la vue globale
 */
export async function listContremarques(workspaceId, { status } = {}) {
  let query = supabase
    .from('contremarques')
    .select(`
      ${CONTREMARQUE_SELECT},
      order:orders(
        id, order_number, status,
        customer:customers(id, first_name, last_name, phone)
      )
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

/**
 * Crée une contremarque liée à un order_item
 */
export async function createContremarque(workspaceId, userId, {
  orderId,
  orderItemId,
  supplierId,
  expectedDate,
  notes,
}) {
  const { data, error } = await supabase
    .from('contremarques')
    .insert({
      workspace_id: workspaceId,
      order_id: orderId,
      order_item_id: orderItemId || null,
      supplier_id: supplierId || null,
      expected_date: expectedDate || null,
      notes: notes || null,
      created_by: userId,
      status: 'en_attente',
    })
    .select(CONTREMARQUE_SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * Met à jour le statut d'une contremarque
 * Passe automatiquement received_date si statut = 'recue'
 */
export async function updateContremarqueStatus(contremarqueId, newStatus, receivedDate = null) {
  const updates = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (newStatus === 'recue') {
    updates.received_date = receivedDate || new Date().toISOString().split('T')[0]
  }

  const { error } = await supabase
    .from('contremarques')
    .update(updates)
    .eq('id', contremarqueId)

  if (error) throw error
}

/**
 * Met à jour les champs d'une contremarque (fournisseur, date, notes)
 */
export async function updateContremarque(contremarqueId, updates) {
  const { error } = await supabase
    .from('contremarques')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', contremarqueId)

  if (error) throw error
}

/**
 * Supprime une contremarque
 */
export async function deleteContremarque(contremarqueId) {
  const { error } = await supabase
    .from('contremarques')
    .delete()
    .eq('id', contremarqueId)

  if (error) throw error
}

/**
 * Vérifie si une commande est prête à livrer (appelle la RPC Supabase)
 */
export async function checkOrderReadyToDeliver(orderId) {
  const { data, error } = await supabase.rpc('is_order_ready_to_deliver', {
    order_id: orderId,
  })
  if (error) throw error
  return !!data
}
