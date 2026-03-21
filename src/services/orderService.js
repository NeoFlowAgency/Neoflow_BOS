import { supabase } from '../lib/supabase'

/**
 * Cree une commande avec ses lignes
 */
export async function createOrder(workspaceId, userId, customerId, items, orderData) {
  // 1. Generer le numero de commande
  const { data: numResult, error: numError } = await supabase.rpc('get_next_order_number', {
    p_workspace_id: workspaceId,
    p_year: new Date().getFullYear()
  })
  if (numError) throw new Error('Erreur generation numero commande: ' + numError.message)

  const orderNumber = numResult?.order_number || numResult

  // 2. Inserer la commande
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      workspace_id: workspaceId,
      customer_id: customerId || null,
      created_by: userId,
      order_number: orderNumber,
      order_type: orderData.order_type || 'standard',
      status: orderData.status || 'confirme',
      source: orderData.source || 'direct',
      quote_id: orderData.quote_id || null,
      subtotal_ht: orderData.subtotal_ht,
      total_tva: orderData.total_tva,
      total_ttc: orderData.total_ttc,
      discount_global: orderData.discount_global || 0,
      discount_type: orderData.discount_type || 'percent',
      remaining_amount: orderData.total_ttc,
      requires_delivery: orderData.requires_delivery || false,
      delivery_type: orderData.delivery_type || 'none',
      notes: orderData.notes || ''
    })
    .select()
    .single()

  if (orderError) throw new Error('Erreur creation commande: ' + orderError.message)

  // 3. Inserer les lignes avec snapshot du cout d'achat
  const itemsToInsert = items.map((item, i) => ({
    order_id: order.id,
    product_id: item.product_id || null,
    description: item.description,
    quantity: item.quantity,
    unit_price_ht: item.unit_price_ht,
    cost_price_ht: item.cost_price_ht || null,
    tax_rate: item.tax_rate || 20,
    discount_item: item.discount_item || 0,
    discount_item_type: item.discount_item_type || 'percent',
    total_ht: item.total_ht,
    position: item.position || i + 1
  }))

  const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert)
  if (itemsError) throw new Error('Erreur ajout lignes commande: ' + itemsError.message)

  return order
}

/**
 * Charge une commande avec ses lignes, paiements et client
 */
export async function getOrder(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customer:customers(*),
      items:order_items(*, product:products(name, reference)),
      payments(*),
      deliveries(*),
      invoices(id, invoice_number, invoice_category, status),
      quote:quotes(id, quote_number, status)
    `)
    .eq('id', orderId)
    .single()

  if (error) throw new Error('Erreur chargement commande: ' + error.message)
  return data
}

/**
 * Liste les commandes d'un workspace
 */
export async function listOrders(workspaceId, filters = {}) {
  let query = supabase
    .from('orders')
    .select(`
      *,
      customer:customers(first_name, last_name, email, phone)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.order_type) {
    query = query.eq('order_type', filters.order_type)
  }

  const { data, error } = await query
  if (error) throw new Error('Erreur liste commandes: ' + error.message)
  return data || []
}

/**
 * Met a jour le statut d'une commande
 */
export async function updateOrderStatus(orderId, status) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw new Error('Erreur mise a jour statut: ' + error.message)
  return data
}

/**
 * Met a jour une commande
 */
export async function updateOrder(orderId, updates) {
  const { data, error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw new Error('Erreur mise a jour commande: ' + error.message)
  return data
}

/**
 * Supprime une commande (proprietaire/manager uniquement)
 */
export async function deleteOrder(orderId) {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', orderId)

  if (error) throw new Error('Erreur suppression commande: ' + error.message)
}

/**
 * Enregistre un paiement sur une commande
 * Le trigger update_order_payment_totals met a jour amount_paid et remaining_amount
 */
export async function createPayment(workspaceId, orderId, userId, paymentData) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      workspace_id: workspaceId,
      order_id: orderId,
      payment_type: paymentData.payment_type || 'full',
      payment_method: paymentData.payment_method || 'cash',
      amount: paymentData.amount,
      payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
      received_by: userId,
      notes: paymentData.notes || ''
    })
    .select()
    .single()

  if (error) throw new Error('Erreur enregistrement paiement: ' + error.message)
  return data
}

/**
 * Liste les paiements d'une commande
 */
export async function listPayments(orderId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*, receiver:profiles!received_by(full_name)')
    .eq('order_id', orderId)
    .order('payment_date', { ascending: true })

  if (error) throw new Error('Erreur liste paiements: ' + error.message)
  return data || []
}

/**
 * Supprime un paiement (proprietaire/manager uniquement)
 */
export async function deletePayment(paymentId) {
  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId)

  if (error) throw new Error('Erreur suppression paiement: ' + error.message)
}

/**
 * Convertit un devis en commande via la fonction SQL
 */
export async function convertQuoteToOrder(quoteId) {
  const { data, error } = await supabase.rpc('convert_quote_to_order', {
    p_quote_id: quoteId
  })
  if (error) throw new Error('Erreur conversion devis en commande: ' + error.message)
  return data
}

/**
 * Genere une facture depuis une commande via la fonction SQL
 */
export async function generateInvoiceFromOrder(orderId, invoiceCategory = 'standard') {
  const { data, error } = await supabase.rpc('generate_invoice_from_order', {
    p_order_id: orderId,
    p_invoice_category: invoiceCategory
  })
  if (error) throw new Error('Erreur generation facture: ' + error.message)
  return data
}
