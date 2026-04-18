import { supabase } from '../lib/supabase'

// ── Lister les tickets SAV ────────────────────────────────────────────────────

export async function listSAVTickets(workspaceId, { status, type, search, limit = 50 } = {}) {
  let query = supabase
    .from('sav_tickets')
    .select(`
      id, ticket_number, type, status, priority, description,
      refund_amount, created_at, updated_at, resolved_at,
      customer_id, order_id, assigned_to, created_by,
      customers (id, first_name, last_name, phone),
      orders (id, order_number)
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
        refund_amount, avoir_generated, avoir_invoice_id,
        created_at, updated_at, resolved_at, closed_at,
        customer_id, order_id, assigned_to, created_by,
        customers (id, first_name, last_name, phone, email, address, city),
        orders (id, order_number, total_ttc, status)
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

// ── Générer un avoir depuis un ticket SAV ─────────────────────────────────────

export async function generateAvoir(ticketId, userId) {
  // Charger le ticket avec ses infos
  const { data: ticket, error: ticketError } = await supabase
    .from('sav_tickets')
    .select('*, customers(id), orders(id)')
    .eq('id', ticketId)
    .single()

  if (ticketError || !ticket) throw new Error('Ticket introuvable')
  if (ticket.avoir_generated) throw new Error('Un avoir a déjà été généré pour ce ticket')

  const refundAmount = Number(ticket.refund_amount || 0)
  if (refundAmount <= 0) throw new Error('Veuillez d\'abord définir le montant du remboursement dans la résolution')

  // Calculer les montants HT/TVA (TVA 20% par défaut)
  const tvaRate = 0.20
  const totalTTC = refundAmount
  const totalHT  = +(totalTTC / (1 + tvaRate)).toFixed(2)
  const totalTVA = +(totalTTC - totalHT).toFixed(2)

  // Obtenir le prochain numéro de facture
  const year = new Date().getFullYear()
  const { data: numResult, error: numError } = await supabase
    .rpc('get_next_invoice_number', { p_workspace_id: ticket.workspace_id, p_year: year })
  if (numError) throw numError
  const invoiceNumber = numResult?.invoice_number

  // Créer la facture d'avoir (montants positifs, type = 'avoir')
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .insert({
      workspace_id:    ticket.workspace_id,
      customer_id:     ticket.customer_id,
      order_id:        ticket.order_id,
      created_by:      userId,
      invoice_number:  invoiceNumber,
      invoice_type:    'avoir',
      invoice_category: 'standard',
      status:          'paid',
      issue_date:      new Date().toISOString().split('T')[0],
      subtotal_ht:     totalHT,
      total_tva:       totalTVA,
      total_ttc:       totalTTC,
      discount_global: 0,
      notes:           `Avoir suite au ticket SAV ${ticket.ticket_number}`,
    })
    .select('id, invoice_number')
    .single()

  if (invError) throw new Error('Erreur création avoir : ' + invError.message)

  // Créer une ligne sur la facture d'avoir
  await supabase.from('invoice_items').insert({
    invoice_id:    invoice.id,
    description:   `Avoir SAV — ${ticket.ticket_number}`,
    quantity:      1,
    unit_price_ht: totalHT,
    tax_rate:      20,
    total_ht:      totalHT,
    position:      1,
  })

  // Mettre à jour le ticket
  await supabase
    .from('sav_tickets')
    .update({ avoir_generated: true, avoir_invoice_id: invoice.id })
    .eq('id', ticketId)

  // Journal
  await addSAVHistory(ticketId, userId, 'avoir_generated', `Avoir ${invoice.invoice_number} généré (${totalTTC.toFixed(2)} €)`)

  return invoice
}

// ── Alerte "100 nuits" — commandes livrées dont le délai approche ────────────

export async function listCentNuitsAlerts(workspaceId) {
  const now = new Date()
  // Fenêtre : livrées il y a entre 80 et 100 jours
  const from = new Date(now.getTime() - 100 * 86400000).toISOString()
  const to   = new Date(now.getTime() -  80 * 86400000).toISOString()

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, delivered_at, status,
      customers (id, first_name, last_name, phone)
    `)
    .eq('workspace_id', workspaceId)
    .not('delivered_at', 'is', null)
    .gte('delivered_at', from)
    .lte('delivered_at', to)
    .order('delivered_at', { ascending: true })

  if (error) throw error
  return (data || []).map(order => ({
    ...order,
    days_since_delivery: Math.floor((now - new Date(order.delivered_at)) / 86400000),
    exchange_deadline: new Date(new Date(order.delivered_at).getTime() + 100 * 86400000),
  }))
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
