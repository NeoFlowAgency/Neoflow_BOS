import { supabase } from '../lib/supabase'

const TUTORIAL_PREFIX = '[TUTORIEL]'

/**
 * Create demo data covering the full NeoFlow BOS workflow.
 * Fails gracefully if new tables (orders, payments, stock_levels) don't exist yet.
 */
export async function createTestData(workspaceId, userId) {
  try {
    // ── 1. Products (3 literie products) ───────────────────────────────────
    const { data: products, error: prodError } = await supabase
      .from('products')
      .insert([
        {
          workspace_id: workspaceId,
          name: `${TUTORIAL_PREFIX} Matelas Memoire de Forme`,
          reference: 'TUT-MAT',
          cost_price_ht: 200,
          price_ht: 399,
          tva_rate: 20,
          category: 'matelas',
          description: 'Matelas de demonstration - haute resilience',
          created_by: userId,
        },
        {
          workspace_id: workspaceId,
          name: `${TUTORIAL_PREFIX} Sommier Tapissier`,
          reference: 'TUT-SOM',
          cost_price_ht: 90,
          price_ht: 199,
          tva_rate: 20,
          category: 'sommier',
          description: 'Sommier de demonstration - 2 personnes',
          created_by: userId,
        },
        {
          workspace_id: workspaceId,
          name: `${TUTORIAL_PREFIX} Oreiller Ergonomique`,
          reference: 'TUT-ORL',
          cost_price_ht: 15,
          price_ht: 39,
          tva_rate: 20,
          category: 'oreiller',
          description: 'Oreiller de demonstration - mousse a memoire',
          created_by: userId,
        },
      ])
      .select()

    if (prodError) {
      console.warn('[onboarding] products insert error:', prodError.message)
    }

    const matelas  = products?.[0]
    const sommier  = products?.[1]
    const oreiller = products?.[2]

    // ── 2. Stock levels (find or use first stock location) ─────────────────
    try {
      const { data: locations } = await supabase
        .from('stock_locations')
        .select('id')
        .eq('workspace_id', workspaceId)
        .limit(1)

      const locationId = locations?.[0]?.id

      if (locationId && products?.length > 0) {
        const stockRows = products.map((p, i) => ({
          workspace_id: workspaceId,
          product_id: p.id,
          location_id: locationId,
          quantity: [8, 5, 12][i] ?? 5,
          reserved_quantity: 0,
        }))
        await supabase.from('stock_levels').insert(stockRows)
      }
    } catch {
      // stock tables may not exist yet
    }

    // ── 3. Customer ────────────────────────────────────────────────────────
    const { data: customer } = await supabase
      .from('customers')
      .insert({
        workspace_id: workspaceId,
        first_name: TUTORIAL_PREFIX,
        last_name: 'Client Demo',
        email: 'demo@tutoriel.neoflow.fr',
        phone: '0600000000',
        address: '12 avenue du Tutoriel',
        city: 'Paris',
        postal_code: '75001',
        created_by: userId,
      })
      .select()
      .single()

    // ── 4. Quote (matelas + sommier, status envoye) ────────────────────────
    const quoteHT  = (matelas?.price_ht || 399) + (sommier?.price_ht || 199)
    const quoteTVA = quoteHT * 0.2
    const quoteTTC = quoteHT + quoteTVA

    const { data: quote } = await supabase
      .from('quotes')
      .insert({
        workspace_id: workspaceId,
        customer_id: customer?.id,
        status: 'envoye',
        total_ht: quoteHT,
        total_tva: quoteTVA,
        total_ttc: quoteTTC,
        issue_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        notes: `${TUTORIAL_PREFIX} Devis de demonstration`,
        created_by: userId,
      })
      .select()
      .single()

    if (quote?.id) {
      const qItems = []
      if (matelas) qItems.push({ quote_id: quote.id, product_id: matelas.id, description: matelas.name, quantity: 1, unit_price_ht: matelas.price_ht, tva_rate: 20, total_ht: matelas.price_ht })
      if (sommier) qItems.push({ quote_id: quote.id, product_id: sommier.id, description: sommier.name, quantity: 1, unit_price_ht: sommier.price_ht, tva_rate: 20, total_ht: sommier.price_ht })
      if (qItems.length > 0) await supabase.from('quote_items').insert(qItems)
    }

    // ── 5. Order 1 (confirme, acompte, from quote) ─────────────────────────
    let order1 = null
    try {
      const orderHT  = quoteHT
      const orderTVA = quoteTVA
      const orderTTC = quoteTTC
      const acompte   = Math.round(orderTTC * 0.3 * 100) / 100
      const remaining = Math.round((orderTTC - acompte) * 100) / 100

      const { data: o1 } = await supabase
        .from('orders')
        .insert({
          workspace_id: workspaceId,
          customer_id: customer?.id,
          order_type: 'standard',
          status: 'confirme',
          source: quote?.id ? 'from_quote' : 'direct',
          quote_id: quote?.id || null,
          subtotal_ht: orderHT,
          total_tva: orderTVA,
          total_ttc: orderTTC,
          amount_paid: acompte,
          remaining_amount: remaining,
          requires_delivery: true,
          delivery_type: 'delivery',
          notes: `${TUTORIAL_PREFIX} Commande avec acompte`,
          created_by: userId,
        })
        .select()
        .single()
      order1 = o1

      // Order items
      if (order1?.id) {
        const oItems = []
        if (matelas) oItems.push({ order_id: order1.id, product_id: matelas.id, description: matelas.name, quantity: 1, unit_price_ht: matelas.price_ht, cost_price_ht: matelas.cost_price_ht || 0, tax_rate: 20, total_ht: matelas.price_ht, position: 1 })
        if (sommier) oItems.push({ order_id: order1.id, product_id: sommier.id, description: sommier.name, quantity: 1, unit_price_ht: sommier.price_ht, cost_price_ht: sommier.cost_price_ht || 0, tax_rate: 20, total_ht: sommier.price_ht, position: 2 })
        if (oItems.length > 0) await supabase.from('order_items').insert(oItems)
      }

      // Payment (acompte)
      if (order1?.id) {
        await supabase.from('payments').insert({
          workspace_id: workspaceId,
          order_id: order1.id,
          payment_type: 'deposit',
          payment_method: 'card',
          amount: acompte,
          payment_date: new Date().toISOString().split('T')[0],
          received_by: userId,
          notes: `${TUTORIAL_PREFIX} Acompte demonstration`,
        })
      }

      // Delivery (planifiee dans 7 jours)
      if (order1?.id) {
        await supabase.from('deliveries').insert({
          workspace_id: workspaceId,
          order_id: order1.id,
          status: 'planifiee',
          scheduled_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          delivery_type: 'delivery',
          delivery_address: '12 avenue du Tutoriel, 75001 Paris',
          notes: `${TUTORIAL_PREFIX} Livraison demonstration`,
          created_by: userId,
        })
      }

      // Invoice (acompte)
      if (order1?.id) {
        await supabase.from('invoices').insert({
          workspace_id: workspaceId,
          customer_id: customer?.id,
          order_id: order1.id,
          invoice_category: 'deposit',
          status: 'envoyee',
          total_ht: Math.round(acompte / 1.2 * 100) / 100,
          total_tva: Math.round((acompte - acompte / 1.2) * 100) / 100,
          total_ttc: acompte,
          notes: `${TUTORIAL_PREFIX} Facture acompte demonstration`,
          created_by: userId,
        })
      }
    } catch (e) {
      console.warn('[onboarding] orders/payments/deliveries error (may need SQL migration):', e.message)
    }

    // ── 6. Order 2 (termine, vente rapide 2 oreillers) ─────────────────────
    try {
      const qty2     = 2
      const o2HT    = (oreiller?.price_ht || 39) * qty2
      const o2TVA   = o2HT * 0.2
      const o2TTC   = o2HT + o2TVA

      const { data: o2 } = await supabase
        .from('orders')
        .insert({
          workspace_id: workspaceId,
          customer_id: customer?.id,
          order_type: 'quick_sale',
          status: 'termine',
          source: 'direct',
          subtotal_ht: o2HT,
          total_tva: o2TVA,
          total_ttc: o2TTC,
          amount_paid: o2TTC,
          remaining_amount: 0,
          requires_delivery: false,
          notes: `${TUTORIAL_PREFIX} Vente terminee demonstration`,
          created_by: userId,
        })
        .select()
        .single()

      if (o2?.id) {
        if (oreiller) {
          await supabase.from('order_items').insert({
            order_id: o2.id,
            product_id: oreiller.id,
            description: oreiller.name,
            quantity: qty2,
            unit_price_ht: oreiller.price_ht,
            cost_price_ht: oreiller.cost_price_ht || 0,
            tax_rate: 20,
            total_ht: o2HT,
            position: 1,
          })
        }

        await supabase.from('payments').insert({
          workspace_id: workspaceId,
          order_id: o2.id,
          payment_type: 'full',
          payment_method: 'cash',
          amount: o2TTC,
          payment_date: new Date().toISOString().split('T')[0],
          received_by: userId,
          notes: `${TUTORIAL_PREFIX} Paiement complet demonstration`,
        })
      }
    } catch (e) {
      console.warn('[onboarding] order2 error:', e.message)
    }

    console.log('[onboarding] Test data created successfully')
    return true
  } catch (err) {
    console.error('[onboarding] Error creating test data:', err)
    return false
  }
}

/**
 * Delete all tutorial test data for a workspace (in FK-safe order)
 */
export async function deleteTestData(workspaceId) {
  try {
    // Find tutorial products (by name prefix)
    const { data: tutProducts } = await supabase
      .from('products')
      .select('id')
      .eq('workspace_id', workspaceId)
      .like('name', `${TUTORIAL_PREFIX}%`)

    const productIds = (tutProducts || []).map(p => p.id)

    // Find tutorial orders
    let orderIds = []
    try {
      const { data: tutOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('workspace_id', workspaceId)
        .like('notes', `${TUTORIAL_PREFIX}%`)
      orderIds = (tutOrders || []).map(o => o.id)
    } catch { /* table may not exist */ }

    // Find tutorial quotes
    const { data: tutQuotes } = await supabase
      .from('quotes')
      .select('id')
      .eq('workspace_id', workspaceId)
      .like('notes', `${TUTORIAL_PREFIX}%`)
    const quoteIds = (tutQuotes || []).map(q => q.id)

    // Find tutorial invoices
    const { data: tutInvoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('workspace_id', workspaceId)
      .like('notes', `${TUTORIAL_PREFIX}%`)
    const invoiceIds = (tutInvoices || []).map(i => i.id)

    // Delete orders + related (FK safe)
    if (orderIds.length > 0) {
      try {
        await supabase.from('payments').delete().in('order_id', orderIds)
        await supabase.from('deliveries').delete().in('order_id', orderIds)
        await supabase.from('order_items').delete().in('order_id', orderIds)
        await supabase.from('orders').delete().in('id', orderIds)
      } catch { /* ignore if tables don't exist */ }
    }

    // Delete quotes
    if (quoteIds.length > 0) {
      await supabase.from('quote_items').delete().in('quote_id', quoteIds)
      await supabase.from('quotes').delete().in('id', quoteIds)
    }

    // Delete invoices
    if (invoiceIds.length > 0) {
      await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds)
      await supabase.from('invoices').delete().in('id', invoiceIds)
    }

    // Delete stock data linked to tutorial products
    if (productIds.length > 0) {
      try {
        await supabase.from('stock_movements').delete().in('product_id', productIds)
        await supabase.from('stock_levels').delete().in('product_id', productIds)
      } catch { /* ignore */ }
      await supabase.from('products').delete().in('id', productIds)
    }

    // Delete tutorial customer
    await supabase
      .from('customers')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('first_name', TUTORIAL_PREFIX)

    console.log('[onboarding] Test data deleted successfully')
    return true
  } catch (err) {
    console.error('[onboarding] Error deleting test data:', err)
    return false
  }
}

/**
 * Mark onboarding as completed in localStorage + profiles table
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
 * Returns true if the tour should be displayed
 */
export function shouldShowOnboarding() {
  return !localStorage.getItem('neoflow_onboarding_done')
}
