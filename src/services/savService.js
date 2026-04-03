import { supabase } from '../lib/supabase'

// ── Lister les tickets SAV ────────────────────────────────────────────────────

export async function listSAVTickets(workspaceId, { status, type, search, limit = 50 } = {}) {
  let query = supabase
    .from('sav_tickets')
    .select(`
      id, ticket_number, type, status, priority, description,
      refund_amount, created_at, updated_at, resolved_at,
      customers (id, first_name, last_name, phone),
      orders (id, order_number),
      assigned_profile:assigned_to (id, full_name),
      created_profile:created_by (id, full_name)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (type)   query = query.eq('type', type)
  if (search) {
    query = query.or(`ticket_number.ilike.%${search}%,description.ilike.%${search}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

// ── Récupérer un ticket avec ses items et son journal ────────────────────────

export async function getSAVTicket(ticketId) {
  const [ticketRes, itemsRes, historyRes] = await Promise.all([
    supabase
      .from('sav_tickets')
      .select(`
        id, ticket_number, type, status, priority, description, resolution,
        refund_amount, created_at, updated_at, resolved_at, closed_at,
        customers (id, first_name, last_name, phone, email, address, city),
        orders (id, order_number, total_ttc, status),
        assigned_profile:assigned_to (id, full_name),
        created_profile:created_by (id, full_name)
      `)
      .eq('id', ticketId)
      .single(),

    supabase
      .from('sav_items')
      .select(`
        id, quantity, condition, action, description, restocked, restocked_at,
        products (id, name, price, category)
      `)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),

    supabase
      .from('sav_history')
      .select(`
        id, action, comment, metadata, created_at,
        profiles:user_id (id, full_name)
      `)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false }),
  ])

  if (ticketRes.error) throw ticketRes.error

  return {
    ticket: ticketRes.data,
    items:  itemsRes.data  || [],
    history: historyRes.data || [],
  }
}

// ── Créer un ticket SAV ───────────────────────────────────────────────────────

export async function createSAVTicket(workspaceId, userId, { type, priority, description, customerId, orderId, items = [] }) {
  // 1. Créer le ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('sav_tickets')
    .insert({
      workspace_id: workspaceId,
      created_by:   userId,
      assigned_to:  userId,
      type,
      priority: priority || 'normale',
      description,
      customer_id: customerId || null,
      order_id:    orderId    || null,
      status: 'ouvert',
    })
    .select('id, ticket_number')
    .single()

  if (ticketError) throw ticketError

  // 2. Créer les articles si fournis
  if (items.length > 0) {
    const itemRows = items.map(item => ({
      ticket_id:  ticket.id,
      product_id: item.productId || null,
      description: item.description || null,
      quantity:   item.quantity || 1,
      condition:  item.condition || 'inconnu',
      action:     item.action || 'en_attente',
    }))

    const { error: itemsError } = await supabase.from('sav_items').insert(itemRows)
    if (itemsError) throw itemsError
  }

  // 3. Entrée dans le journal
  await addSAVHistory(ticket.id, userId, 'created', `Ticket ${ticket.ticket_number} créé`)

  return ticket
}

// ── Mettre à jour le statut d'un ticket ──────────────────────────────────────

export async function updateSAVStatus(ticketId, userId, newStatus, comment = '') {
  const { data: current } = await supabase
    .from('sav_tickets')
    .select('status')
    .eq('id', ticketId)
    .single()

  const { error } = await supabase
    .from('sav_tickets')
    .update({ status: newStatus })
    .eq('id', ticketId)

  if (error) throw error

  await addSAVHistory(ticketId, userId, 'status_changed', comment || `Statut changé`, {
    from: current?.status,
    to: newStatus,
  })
}

// ── Ajouter une résolution ────────────────────────────────────────────────────

export async function resolveSAVTicket(ticketId, userId, { resolution, refundAmount = 0, newStatus = 'resolu' }) {
  const { error } = await supabase
    .from('sav_tickets')
    .update({ resolution, refund_amount: refundAmount, status: newStatus })
    .eq('id', ticketId)

  if (error) throw error

  await addSAVHistory(ticketId, userId, 'resolved', resolution)
}

// ── Ajouter un commentaire au journal ─────────────────────────────────────────

export async function addSAVComment(ticketId, userId, comment) {
  await addSAVHistory(ticketId, userId, 'comment', comment)
}

// ── Mettre à jour l'action d'un article ───────────────────────────────────────

export async function updateSAVItemAction(itemId, ticketId, userId, action) {
  const { error } = await supabase
    .from('sav_items')
    .update({ action })
    .eq('id', itemId)

  if (error) throw error
  await addSAVHistory(ticketId, userId, 'item_updated', `Action article mise à jour : ${action}`)
}

// ── Remettre un article en stock ──────────────────────────────────────────────

export async function restockSAVItem(itemId, ticketId, userId, { productId, locationId, quantity }) {
  if (!productId || !locationId) return

  // Incrémenter le stock
  const { data: existing } = await supabase
    .from('stock_levels')
    .select('id, quantity_available')
    .eq('product_id', productId)
    .eq('location_id', locationId)
    .single()

  if (existing) {
    await supabase
      .from('stock_levels')
      .update({ quantity_available: existing.quantity_available + (quantity || 1) })
      .eq('id', existing.id)
  } else {
    await supabase.from('stock_levels').insert({
      product_id: productId,
      location_id: locationId,
      quantity_available: quantity || 1,
    })
  }

  // Marquer l'article comme remis en stock
  await supabase
    .from('sav_items')
    .update({ restocked: true, restocked_at: new Date().toISOString() })
    .eq('id', itemId)

  // Enregistrer un mouvement de stock
  await supabase.from('stock_movements').insert({
    product_id: productId,
    location_id: locationId,
    quantity: quantity || 1,
    movement_type: 'retour_sav',
    notes: `Retour SAV — ticket #${ticketId}`,
  })

  await addSAVHistory(ticketId, userId, 'restocked', `Article remis en stock (qty: ${quantity || 1})`)
}

// ── Helper interne : ajouter une entrée journal ───────────────────────────────

async function addSAVHistory(ticketId, userId, action, comment = '', metadata = null) {
  await supabase.from('sav_history').insert({
    ticket_id: ticketId,
    user_id:   userId,
    action,
    comment,
    ...(metadata ? { metadata } : {}),
  })
}

// ── Compter les tickets ouverts (pour badge sidebar) ──────────────────────────

export async function countOpenSAVTickets(workspaceId) {
  const { count, error } = await supabase
    .from('sav_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .in('status', ['ouvert', 'en_cours'])

  if (error) return 0
  return count || 0
}
