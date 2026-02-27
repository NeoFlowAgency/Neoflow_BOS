import { supabase } from '../lib/supabase'

// ============================================================
// SUPPLIERS
// ============================================================

/**
 * Liste les fournisseurs d'un workspace
 */
export async function listSuppliers(workspaceId) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_archived', false)
    .order('name', { ascending: true })

  if (error) throw new Error('Erreur chargement fournisseurs: ' + error.message)
  return data || []
}

/**
 * Charge un fournisseur avec ses produits lies et commandes
 */
export async function getSupplier(supplierId) {
  const { data, error } = await supabase
    .from('suppliers')
    .select(`
      *,
      product_suppliers(*, product:products(id, name, reference, unit_price_ht)),
      purchase_orders(id, po_number, status, expected_date, total_ht, created_at)
    `)
    .eq('id', supplierId)
    .single()

  if (error) throw new Error('Erreur chargement fournisseur: ' + error.message)
  return data
}

/**
 * Cree un fournisseur
 */
export async function createSupplier(workspaceId, supplierData) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      workspace_id: workspaceId,
      name: supplierData.name,
      contact_name: supplierData.contact_name || null,
      email: supplierData.email || null,
      phone: supplierData.phone || null,
      address: supplierData.address || null,
      city: supplierData.city || null,
      postal_code: supplierData.postal_code || null,
      country: supplierData.country || 'France',
      notes: supplierData.notes || null
    })
    .select()
    .single()

  if (error) throw new Error('Erreur creation fournisseur: ' + error.message)
  return data
}

/**
 * Met a jour un fournisseur
 */
export async function updateSupplier(supplierId, updates) {
  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', supplierId)
    .select()
    .single()

  if (error) throw new Error('Erreur mise a jour fournisseur: ' + error.message)
  return data
}

/**
 * Archive un fournisseur (soft delete)
 */
export async function archiveSupplier(supplierId) {
  const { error } = await supabase
    .from('suppliers')
    .update({ is_archived: true })
    .eq('id', supplierId)

  if (error) throw new Error('Erreur archivage fournisseur: ' + error.message)
}

// ============================================================
// PRODUCT-SUPPLIER LINKS
// ============================================================

/**
 * Lie un produit a un fournisseur
 */
export async function linkProductSupplier(productId, supplierId, data = {}) {
  const { data: result, error } = await supabase
    .from('product_suppliers')
    .insert({
      product_id: productId,
      supplier_id: supplierId,
      supplier_reference: data.supplier_reference || null,
      supplier_cost_ht: data.supplier_cost_ht || null,
      is_primary: data.is_primary || false
    })
    .select()
    .single()

  if (error) throw new Error('Erreur liaison produit-fournisseur: ' + error.message)
  return result
}

/**
 * Supprime le lien produit-fournisseur
 */
export async function unlinkProductSupplier(productId, supplierId) {
  const { error } = await supabase
    .from('product_suppliers')
    .delete()
    .eq('product_id', productId)
    .eq('supplier_id', supplierId)

  if (error) throw new Error('Erreur suppression liaison: ' + error.message)
}

/**
 * Liste les fournisseurs d'un produit
 */
export async function getProductSuppliers(productId) {
  const { data, error } = await supabase
    .from('product_suppliers')
    .select('*, supplier:suppliers(id, name, email, phone)')
    .eq('product_id', productId)
    .order('is_primary', { ascending: false })

  if (error) throw new Error('Erreur chargement fournisseurs produit: ' + error.message)
  return data || []
}

// ============================================================
// PURCHASE ORDERS
// ============================================================

/**
 * Cree un bon de commande fournisseur
 */
export async function createPurchaseOrder(workspaceId, userId, supplierId, items, poData = {}) {
  // Generer le numero
  const { data: numResult, error: numError } = await supabase.rpc('get_next_po_number', {
    p_workspace_id: workspaceId,
    p_year: new Date().getFullYear()
  })
  if (numError) throw new Error('Erreur generation numero bon commande: ' + numError.message)

  const poNumber = numResult?.po_number || numResult

  // Calculer les totaux
  const totalHt = items.reduce((sum, item) => sum + item.total_ht, 0)
  const totalTtc = items.reduce((sum, item) => {
    const taxRate = item.tax_rate || 20
    return sum + item.total_ht * (1 + taxRate / 100)
  }, 0)

  // Inserer le bon de commande
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      workspace_id: workspaceId,
      supplier_id: supplierId,
      po_number: poNumber,
      status: poData.status || 'brouillon',
      expected_date: poData.expected_date || null,
      total_ht: totalHt,
      total_ttc: totalTtc,
      notes: poData.notes || '',
      created_by: userId
    })
    .select()
    .single()

  if (poError) throw new Error('Erreur creation bon commande: ' + poError.message)

  // Inserer les lignes
  const itemsToInsert = items.map(item => ({
    purchase_order_id: po.id,
    product_id: item.product_id,
    quantity_ordered: item.quantity_ordered,
    unit_cost_ht: item.unit_cost_ht,
    tax_rate: item.tax_rate || 20,
    total_ht: item.total_ht
  }))

  const { error: itemsError } = await supabase.from('purchase_order_items').insert(itemsToInsert)
  if (itemsError) throw new Error('Erreur ajout lignes bon commande: ' + itemsError.message)

  return po
}

/**
 * Charge un bon de commande avec ses lignes
 */
export async function getPurchaseOrder(poId) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(name, email, phone),
      items:purchase_order_items(*, product:products(name, reference))
    `)
    .eq('id', poId)
    .single()

  if (error) throw new Error('Erreur chargement bon commande: ' + error.message)
  return data
}

/**
 * Liste les bons de commande d'un workspace
 */
export async function listPurchaseOrders(workspaceId, filters = {}) {
  let query = supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(name)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.supplier_id) {
    query = query.eq('supplier_id', filters.supplier_id)
  }

  const { data, error } = await query
  if (error) throw new Error('Erreur liste bons commande: ' + error.message)
  return data || []
}

/**
 * Met a jour le statut d'un bon de commande
 */
export async function updatePurchaseOrderStatus(poId, status) {
  const updates = { status, updated_at: new Date().toISOString() }
  if (status === 'recu') {
    updates.received_date = new Date().toISOString().split('T')[0]
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', poId)
    .select()
    .single()

  if (error) throw new Error('Erreur mise a jour statut: ' + error.message)
  return data
}

/**
 * Enregistre la reception de marchandise (partielle ou totale)
 * Met a jour les quantites recues et le stock
 */
export async function receiveGoods(workspaceId, poId, receivedItems, locationId, userId) {
  let allReceived = true

  for (const item of receivedItems) {
    // Mettre a jour quantity_received sur la ligne
    const { data: poItem, error: updateError } = await supabase
      .from('purchase_order_items')
      .update({ quantity_received: item.quantity_received })
      .eq('id', item.id)
      .select()
      .single()

    if (updateError) throw new Error('Erreur MAJ reception: ' + updateError.message)

    if (poItem.quantity_received < poItem.quantity_ordered) {
      allReceived = false
    }

    // Ajouter au stock
    if (item.quantity_to_add > 0) {
      const { data: current } = await supabase
        .from('stock_levels')
        .select('id, quantity')
        .eq('product_id', poItem.product_id)
        .eq('location_id', locationId)
        .single()

      if (current) {
        await supabase
          .from('stock_levels')
          .update({
            quantity: current.quantity + item.quantity_to_add,
            updated_at: new Date().toISOString()
          })
          .eq('id', current.id)
      } else {
        await supabase
          .from('stock_levels')
          .insert({
            workspace_id: workspaceId,
            product_id: poItem.product_id,
            location_id: locationId,
            quantity: item.quantity_to_add
          })
      }

      // Mouvement de stock
      await supabase
        .from('stock_movements')
        .insert({
          workspace_id: workspaceId,
          product_id: poItem.product_id,
          location_id: locationId,
          movement_type: 'in',
          quantity: item.quantity_to_add,
          reference_type: 'purchase_order',
          reference_id: poId,
          notes: `Reception bon commande`,
          created_by: userId
        })
    }
  }

  // Mettre a jour le statut du bon de commande
  const newStatus = allReceived ? 'recu' : 'reception_partielle'
  await updatePurchaseOrderStatus(poId, newStatus)

  return { status: newStatus }
}
