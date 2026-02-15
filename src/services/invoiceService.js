import { supabase } from '../lib/supabase'

/**
 * Create an invoice directly in Supabase (replaces n8n workflow)
 */
export async function createInvoice(workspaceId, userId, customerId, items, invoiceData) {
  // 1. Get next invoice number via SQL function
  const { data: numResult, error: numError } = await supabase.rpc('get_next_invoice_number', {
    p_workspace_id: workspaceId,
    p_year: new Date().getFullYear()
  })

  if (numError) throw new Error('Erreur génération numéro facture: ' + numError.message)
  const invoiceNumber = numResult?.invoice_number

  // 2. INSERT invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      workspace_id: workspaceId,
      customer_id: customerId,
      created_by: userId,
      invoice_number: invoiceNumber,
      invoice_type: 'facture',
      status: 'brouillon',
      discount_global: invoiceData.discount_global || 0,
      discount_type: invoiceData.discount_type || 'percent',
      notes: invoiceData.notes || '',
      validity_days: invoiceData.validity_days || 30,
      has_delivery: invoiceData.has_delivery || false,
      delivery_date: invoiceData.delivery_date || null,
      subtotal_ht: invoiceData.subtotal_ht,
      total_tva: invoiceData.total_tva,
      total_ttc: invoiceData.total_ttc
    })
    .select()
    .single()

  if (invoiceError) throw new Error('Erreur création facture: ' + invoiceError.message)

  // 3. INSERT invoice_items
  const itemsToInsert = items.map((item, i) => ({
    invoice_id: invoice.id,
    product_id: item.product_id,
    description: item.description,
    quantity: item.quantity,
    unit_price_ht: item.unit_price_ht,
    tax_rate: item.tax_rate,
    total_ht: item.total_ht,
    position: item.position || i + 1
  }))

  const { error: itemsError } = await supabase.from('invoice_items').insert(itemsToInsert)
  if (itemsError) throw new Error('Erreur ajout lignes facture: ' + itemsError.message)

  return invoice
}
