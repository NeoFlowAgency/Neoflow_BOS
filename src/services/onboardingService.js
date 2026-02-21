import { supabase } from '../lib/supabase'

const TUTORIAL_PREFIX = '[TUTORIEL]'

/**
 * Create test data for the onboarding tutorial
 */
export async function createTestData(workspaceId, userId) {
  try {
    // 1. Create test product
    const { data: product } = await supabase
      .from('products')
      .insert({
        workspace_id: workspaceId,
        name: `${TUTORIAL_PREFIX} Produit exemple`,
        description: 'Ceci est un produit de demonstration cree par le tutoriel',
        price_ht: 100,
        tva_rate: 20,
        created_by: userId,
      })
      .select()
      .single()

    // 2. Create test customer
    const { data: customer } = await supabase
      .from('customers')
      .insert({
        workspace_id: workspaceId,
        first_name: TUTORIAL_PREFIX,
        last_name: 'Client Demo',
        email: 'demo@tutoriel.neoflow.fr',
        phone: '0600000000',
        address: '1 rue du Tutoriel, 75001 Paris',
        created_by: userId,
      })
      .select()
      .single()

    // 3. Create test quote
    const { data: quote } = await supabase
      .from('quotes')
      .insert({
        workspace_id: workspaceId,
        customer_id: customer?.id,
        status: 'envoye',
        total_ht: 100,
        total_tva: 20,
        total_ttc: 120,
        issue_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        notes: `${TUTORIAL_PREFIX} Devis de demonstration`,
        created_by: userId,
      })
      .select()
      .single()

    // 4. Create quote items
    if (quote?.id && product?.id) {
      await supabase
        .from('quote_items')
        .insert({
          quote_id: quote.id,
          product_id: product.id,
          description: product.name,
          quantity: 1,
          unit_price_ht: 100,
          tva_rate: 20,
          total_ht: 100,
        })
    }

    // 5. Create test invoice
    const { data: invoice } = await supabase
      .from('invoices')
      .insert({
        workspace_id: workspaceId,
        customer_id: customer?.id,
        status: 'payee',
        total_ht: 100,
        total_tva: 20,
        total_ttc: 120,
        notes: `${TUTORIAL_PREFIX} Facture de demonstration`,
        created_by: userId,
      })
      .select()
      .single()

    // 6. Create invoice items
    if (invoice?.id && product?.id) {
      await supabase
        .from('invoice_items')
        .insert({
          invoice_id: invoice.id,
          product_id: product.id,
          description: product.name,
          quantity: 1,
          unit_price_ht: 100,
          tva_rate: 20,
          total_ht: 100,
        })
    }

    // 7. Create test delivery
    if (invoice?.id) {
      await supabase
        .from('deliveries')
        .insert({
          workspace_id: workspaceId,
          invoice_id: invoice.id,
          status: 'en_cours',
          delivery_address: '1 rue du Tutoriel, 75001 Paris',
          notes: `${TUTORIAL_PREFIX} Livraison de demonstration`,
          created_by: userId,
        })
    }

    console.log('[onboarding] Test data created successfully')
    return true
  } catch (err) {
    console.error('[onboarding] Error creating test data:', err)
    return false
  }
}

/**
 * Delete all tutorial test data from a workspace
 */
export async function deleteTestData(workspaceId) {
  try {
    // Find tutorial invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('workspace_id', workspaceId)
      .like('notes', `${TUTORIAL_PREFIX}%`)

    const invoiceIds = (invoices || []).map(i => i.id)

    // Find tutorial quotes
    const { data: quotes } = await supabase
      .from('quotes')
      .select('id')
      .eq('workspace_id', workspaceId)
      .like('notes', `${TUTORIAL_PREFIX}%`)

    const quoteIds = (quotes || []).map(q => q.id)

    // Delete in FK order
    if (invoiceIds.length > 0) {
      await supabase.from('deliveries').delete().in('invoice_id', invoiceIds)
      await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds)
      await supabase.from('invoices').delete().in('id', invoiceIds)
    }

    if (quoteIds.length > 0) {
      await supabase.from('quote_items').delete().in('quote_id', quoteIds)
      await supabase.from('quotes').delete().in('id', quoteIds)
    }

    // Delete tutorial customers
    await supabase
      .from('customers')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('first_name', TUTORIAL_PREFIX)

    // Delete tutorial products
    await supabase
      .from('products')
      .delete()
      .eq('workspace_id', workspaceId)
      .like('name', `${TUTORIAL_PREFIX}%`)

    console.log('[onboarding] Test data deleted successfully')
    return true
  } catch (err) {
    console.error('[onboarding] Error deleting test data:', err)
    return false
  }
}

/**
 * Mark onboarding as completed
 */
export async function markOnboardingComplete(userId) {
  localStorage.setItem('neoflow_onboarding_done', '1')
  try {
    await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', userId)
  } catch {
    // profiles table might not have the column yet
  }
}

/**
 * Check if onboarding should be shown
 */
export function shouldShowOnboarding() {
  if (localStorage.getItem('neoflow_onboarding_done')) return false
  return true
}
