import { supabase } from '../lib/supabase'

// ============================================================
// STOCK LOCATIONS
// ============================================================

/**
 * Liste les emplacements stock d'un workspace
 */
export async function listStockLocations(workspaceId) {
  const { data, error } = await supabase
    .from('stock_locations')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (error) throw new Error('Erreur chargement emplacements: ' + error.message)
  return data || []
}

/**
 * Cree un emplacement stock
 */
export async function createStockLocation(workspaceId, locationData) {
  const { data, error } = await supabase
    .from('stock_locations')
    .insert({
      workspace_id: workspaceId,
      name: locationData.name,
      type: locationData.type || 'warehouse',
      address: locationData.address || null,
      is_default: false
    })
    .select()
    .single()

  if (error) throw new Error('Erreur creation emplacement: ' + error.message)
  return data
}

/**
 * Met a jour un emplacement stock
 */
export async function updateStockLocation(locationId, updates) {
  const { data, error } = await supabase
    .from('stock_locations')
    .update(updates)
    .eq('id', locationId)
    .select()
    .single()

  if (error) throw new Error('Erreur mise a jour emplacement: ' + error.message)
  return data
}

/**
 * Supprime un emplacement stock (impossible si default)
 */
export async function deleteStockLocation(locationId) {
  const { error } = await supabase
    .from('stock_locations')
    .delete()
    .eq('id', locationId)
    .eq('is_default', false)

  if (error) throw new Error('Erreur suppression emplacement: ' + error.message)
}

// ============================================================
// STOCK LEVELS
// ============================================================

/**
 * Charge les niveaux de stock pour un workspace
 * Retourne les niveaux joins avec produits et emplacements
 */
export async function getStockLevels(workspaceId) {
  const { data, error } = await supabase
    .from('stock_levels')
    .select(`
      *,
      product:products(id, name, reference, category, unit_price_ht, cost_price_ht, is_archived),
      location:stock_locations(id, name, type, is_default)
    `)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error('Erreur chargement niveaux stock: ' + error.message)
  return data || []
}

/**
 * Retourne le stock total d'un produit (tous emplacements confondus)
 */
export async function getProductStockTotal(workspaceId, productId) {
  const { data, error } = await supabase
    .from('stock_levels')
    .select('quantity, reserved_quantity, location:stock_locations(name, type)')
    .eq('workspace_id', workspaceId)
    .eq('product_id', productId)

  if (error) throw new Error('Erreur chargement stock produit: ' + error.message)

  const total = (data || []).reduce((acc, sl) => acc + (sl.quantity - sl.reserved_quantity), 0)
  return { total, locations: data || [] }
}

/**
 * Ajustement manuel du stock
 */
export async function adjustStock(workspaceId, productId, locationId, newQuantity, notes, userId) {
  // Charger le niveau actuel
  const { data: current } = await supabase
    .from('stock_levels')
    .select('quantity')
    .eq('product_id', productId)
    .eq('location_id', locationId)
    .single()

  const oldQuantity = current?.quantity || 0
  const diff = newQuantity - oldQuantity

  // Upsert le niveau de stock
  const { error: levelError } = await supabase
    .from('stock_levels')
    .upsert({
      workspace_id: workspaceId,
      product_id: productId,
      location_id: locationId,
      quantity: newQuantity,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'product_id,location_id'
    })

  if (levelError) throw new Error('Erreur ajustement stock: ' + levelError.message)

  // Creer le mouvement de stock
  if (diff !== 0) {
    const { error: movError } = await supabase
      .from('stock_movements')
      .insert({
        workspace_id: workspaceId,
        product_id: productId,
        location_id: locationId,
        movement_type: 'adjustment',
        quantity: diff,
        reference_type: 'adjustment',
        notes: notes || `Ajustement: ${oldQuantity} → ${newQuantity}`,
        created_by: userId
      })

    if (movError) console.error('Erreur creation mouvement stock:', movError.message)
  }
}

/**
 * Reserve du stock pour une commande (a l'encaissement de l'acompte)
 * Incremente reserved_quantity, cree mouvement type=reservation
 */
export async function reserveStock(workspaceId, orderId, items, locationId, userId) {
  for (const item of items) {
    if (!item.product_id) continue

    // Incrementer reserved_quantity
    const { data: current } = await supabase
      .from('stock_levels')
      .select('id, reserved_quantity')
      .eq('product_id', item.product_id)
      .eq('location_id', locationId)
      .single()

    if (current) {
      await supabase
        .from('stock_levels')
        .update({
          reserved_quantity: (current.reserved_quantity || 0) + item.quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', current.id)
    }

    // Creer mouvement
    await supabase
      .from('stock_movements')
      .insert({
        workspace_id: workspaceId,
        product_id: item.product_id,
        location_id: locationId,
        movement_type: 'reservation',
        quantity: item.quantity,
        reference_type: 'order',
        reference_id: orderId,
        created_by: userId
      })
  }
}

/**
 * Debite le stock reellement (au paiement)
 * Decremente quantity ET reserved_quantity, cree mouvement type=out
 */
export async function debitStock(workspaceId, orderId, items, locationId, userId) {
  for (const item of items) {
    if (!item.product_id) continue

    const { data: current } = await supabase
      .from('stock_levels')
      .select('id, quantity, reserved_quantity')
      .eq('product_id', item.product_id)
      .eq('location_id', locationId)
      .single()

    if (current) {
      await supabase
        .from('stock_levels')
        .update({
          quantity: Math.max(0, (current.quantity || 0) - item.quantity),
          reserved_quantity: Math.max(0, (current.reserved_quantity || 0) - item.quantity),
          updated_at: new Date().toISOString()
        })
        .eq('id', current.id)
    }

    await supabase
      .from('stock_movements')
      .insert({
        workspace_id: workspaceId,
        product_id: item.product_id,
        location_id: locationId,
        movement_type: 'out',
        quantity: -item.quantity,
        reference_type: 'order',
        reference_id: orderId,
        created_by: userId
      })
  }
}

/**
 * Annule la reservation de stock (annulation commande)
 */
export async function unreserveStock(workspaceId, orderId, items, locationId, userId) {
  for (const item of items) {
    if (!item.product_id) continue

    const { data: current } = await supabase
      .from('stock_levels')
      .select('id, reserved_quantity')
      .eq('product_id', item.product_id)
      .eq('location_id', locationId)
      .single()

    if (current) {
      await supabase
        .from('stock_levels')
        .update({
          reserved_quantity: Math.max(0, (current.reserved_quantity || 0) - item.quantity),
          updated_at: new Date().toISOString()
        })
        .eq('id', current.id)
    }

    await supabase
      .from('stock_movements')
      .insert({
        workspace_id: workspaceId,
        product_id: item.product_id,
        location_id: locationId,
        movement_type: 'unreservation',
        quantity: item.quantity,
        reference_type: 'order',
        reference_id: orderId,
        created_by: userId
      })
  }
}

/**
 * Transfert de stock entre emplacements
 */
export async function transferStock(workspaceId, productId, fromLocationId, toLocationId, quantity, userId) {
  if (quantity <= 0) throw new Error('La quantite doit etre positive')

  // Debiter source
  const { data: source } = await supabase
    .from('stock_levels')
    .select('id, quantity')
    .eq('product_id', productId)
    .eq('location_id', fromLocationId)
    .single()

  if (!source || source.quantity < quantity) {
    throw new Error('Stock insuffisant dans l\'emplacement source')
  }

  await supabase
    .from('stock_levels')
    .update({ quantity: source.quantity - quantity, updated_at: new Date().toISOString() })
    .eq('id', source.id)

  // Crediter destination (upsert)
  const { data: dest } = await supabase
    .from('stock_levels')
    .select('id, quantity')
    .eq('product_id', productId)
    .eq('location_id', toLocationId)
    .single()

  if (dest) {
    await supabase
      .from('stock_levels')
      .update({ quantity: dest.quantity + quantity, updated_at: new Date().toISOString() })
      .eq('id', dest.id)
  } else {
    await supabase
      .from('stock_levels')
      .insert({
        workspace_id: workspaceId,
        product_id: productId,
        location_id: toLocationId,
        quantity: quantity
      })
  }

  // Creer les mouvements
  await supabase.from('stock_movements').insert([
    {
      workspace_id: workspaceId,
      product_id: productId,
      location_id: fromLocationId,
      movement_type: 'transfer_out',
      quantity: -quantity,
      reference_type: 'transfer',
      notes: `Transfert vers ${toLocationId}`,
      created_by: userId
    },
    {
      workspace_id: workspaceId,
      product_id: productId,
      location_id: toLocationId,
      movement_type: 'transfer_in',
      quantity: quantity,
      reference_type: 'transfer',
      notes: `Transfert depuis ${fromLocationId}`,
      created_by: userId
    }
  ])
}

/**
 * Charge les mouvements de stock (audit trail)
 */
export async function listStockMovements(workspaceId, filters = {}) {
  let query = supabase
    .from('stock_movements')
    .select(`
      *,
      product:products(name, reference),
      location:stock_locations(name, type),
      user:profiles!created_by(full_name)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(filters.limit || 100)

  if (filters.product_id) {
    query = query.eq('product_id', filters.product_id)
  }
  if (filters.location_id) {
    query = query.eq('location_id', filters.location_id)
  }

  const { data, error } = await query
  if (error) throw new Error('Erreur chargement mouvements: ' + error.message)
  return data || []
}

/**
 * Calcule les alertes stock pour un workspace
 */
export async function getStockAlerts(workspaceId, lowStockThreshold = 3) {
  const { data: levels, error } = await supabase
    .from('stock_levels')
    .select(`
      quantity, reserved_quantity,
      product:products(id, name, reference, is_archived),
      location:stock_locations(name, type)
    `)
    .eq('workspace_id', workspaceId)

  if (error) throw new Error('Erreur chargement alertes stock: ' + error.message)

  // Agreger par produit
  const productStocks = {}
  for (const sl of (levels || [])) {
    if (sl.product?.is_archived) continue
    const pid = sl.product?.id
    if (!pid) continue
    if (!productStocks[pid]) {
      productStocks[pid] = { product: sl.product, totalAvailable: 0, locations: [] }
    }
    const available = (sl.quantity || 0) - (sl.reserved_quantity || 0)
    productStocks[pid].totalAvailable += available
    productStocks[pid].locations.push({
      location: sl.location,
      quantity: sl.quantity,
      reserved: sl.reserved_quantity,
      available
    })
  }

  const outOfStock = []
  const lowStock = []

  for (const ps of Object.values(productStocks)) {
    if (ps.totalAvailable <= 0) {
      outOfStock.push(ps)
    } else if (ps.totalAvailable < lowStockThreshold) {
      lowStock.push(ps)
    }
  }

  return { outOfStock, lowStock }
}
