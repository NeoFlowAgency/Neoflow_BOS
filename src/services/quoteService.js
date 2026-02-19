import { supabase } from '../lib/supabase'

/**
 * Create a quote directly in Supabase (replaces n8n workflow)
 */
export async function createQuote(workspaceId, userId, customerId, items, quoteData) {
  // 1. Get next quote number via SQL function
  const { data: numResult, error: numError } = await supabase.rpc('get_next_quote_number', {
    p_workspace_id: workspaceId,
    p_year: new Date().getFullYear()
  })

  if (numError) throw new Error('Erreur génération numéro devis: ' + numError.message)
  const quoteNumber = numResult?.quote_number

  // 2. INSERT quote
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      workspace_id: workspaceId,
      customer_id: customerId,
      created_by: userId,
      quote_ref: quoteNumber,
      quote_number: quoteNumber,
      status: 'draft',
      issue_date: quoteData.quote_date,
      valid_until: quoteData.valid_until,
      validity_days: quoteData.validity_days || 30,
      discount_global: quoteData.discount_global || 0,
      subtotal_ht: quoteData.subtotal_ht,
      total_tva: quoteData.total_tva,
      total_ttc: quoteData.total_ttc,
      notes: quoteData.notes || ''
    })
    .select()
    .single()

  if (quoteError) throw new Error('Erreur création devis: ' + quoteError.message)

  // 3. INSERT quote_items
  const itemsToInsert = items.map((item, i) => ({
    quote_id: quote.id,
    product_id: item.product_id,
    description: item.description,
    quantity: item.quantity,
    unit_price_ht: item.unit_price_ht,
    tax_rate: item.tax_rate,
    total_ht: item.total_ht,
    position: item.position || i + 1
  }))

  const { error: itemsError } = await supabase.from('quote_items').insert(itemsToInsert)
  if (itemsError) throw new Error('Erreur ajout lignes devis: ' + itemsError.message)

  return quote
}

/**
 * Convert a quote to an invoice via SQL function (atomic operation)
 */
export async function convertQuoteToInvoice(quoteId) {
  const { data, error } = await supabase.rpc('convert_quote_to_invoice', {
    p_quote_id: quoteId
  })

  if (error) throw new Error('Erreur conversion devis: ' + error.message)
  return data
}
