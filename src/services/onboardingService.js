import { supabase } from '../lib/supabase'

const TUTORIAL_PREFIX = '[TUTORIEL]'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Date ISO à N mois en arrière depuis aujourd'hui */
function monthsAgo(n, day = 15) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  d.setDate(day)
  return d.toISOString().split('T')[0]
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ── Tutorial start time ───────────────────────────────────────────────────────

export function recordTutorialStart() {
  localStorage.setItem('neoflow_tutorial_started_at', new Date().toISOString())
}

export function getTutorialStartTime() {
  return localStorage.getItem('neoflow_tutorial_started_at')
}

/**
 * Create comprehensive demo data covering the full NeoFlow BOS workflow.
 * Creates invoices spread over 6 months so statistics charts are fully populated.
 */
export async function createTestData(workspaceId, userId) {
  recordTutorialStart()

  try {
    // ── 1. Products ──────────────────────────────────────────────────────────
    const { data: products, error: prodError } = await supabase
      .from('products')
      .insert([
        {
          workspace_id: workspaceId,
          name: `${TUTORIAL_PREFIX} Matelas Mémoire de Forme`,
          reference: 'TUT-MAT',
          cost_price_ht: 200,
          price_ht: 399,
          tva_rate: 20,
          category: 'matelas',
          description: 'Matelas de démonstration - haute résilience',
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
          description: 'Sommier de démonstration - 2 personnes',
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
          description: 'Oreiller de démonstration - mousse à mémoire',
          created_by: userId,
        },
        {
          workspace_id: workspaceId,
          name: `${TUTORIAL_PREFIX} Couette Hiver 400g`,
          reference: 'TUT-COU',
          cost_price_ht: 35,
          price_ht: 79,
          tva_rate: 20,
          category: 'literie',
          description: 'Couette de démonstration - garnissage plume',
          created_by: userId,
        },
        {
          workspace_id: workspaceId,
          name: `${TUTORIAL_PREFIX} Protège-matelas Imperméable`,
          reference: 'TUT-PRO',
          cost_price_ht: 12,
          price_ht: 29,
          tva_rate: 20,
          category: 'protection',
          description: 'Protège-matelas de démonstration',
          created_by: userId,
        },
      ])
      .select()

    if (prodError) console.warn('[onboarding] products insert error:', prodError.message)

    const [matelas, sommier, oreiller] = products || []

    // ── 2. Stock levels ──────────────────────────────────────────────────────
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
          quantity: [8, 5, 12, 15, 20][i] ?? 5,
          reserved_quantity: [1, 1, 0, 0, 0][i] ?? 0,
        }))
        await supabase.from('stock_levels').insert(stockRows)
      }
    } catch { /* stock tables may not exist yet */ }

    // ── 3. Customers (3 clients) ─────────────────────────────────────────────
    const { data: customer1 } = await supabase
      .from('customers')
      .insert({
        workspace_id: workspaceId,
        first_name: TUTORIAL_PREFIX,
        last_name: 'Client Demo',
        email: 'demo@tutoriel.neoflow.fr',
        phone: '0600000001',
        address: '12 avenue du Tutoriel',
        city: 'Paris',
        postal_code: '75001',
        created_by: userId,
      })
      .select()
      .single()

    const { data: customer2 } = await supabase
      .from('customers')
      .insert({
        workspace_id: workspaceId,
        first_name: `${TUTORIAL_PREFIX} Marie`,
        last_name: 'Dupont',
        email: 'marie.dupont@demo.fr',
        phone: '0600000002',
        city: 'Lyon',
        postal_code: '69001',
        created_by: userId,
      })
      .select()
      .single()

    const { data: customer3 } = await supabase
      .from('customers')
      .insert({
        workspace_id: workspaceId,
        first_name: `${TUTORIAL_PREFIX} Pierre`,
        last_name: 'Martin',
        email: 'pierre.martin@demo.fr',
        phone: '0600000003',
        city: 'Marseille',
        postal_code: '13001',
        created_by: userId,
      })
      .select()
      .single()

    // ── 4. Quote (current, sent) ─────────────────────────────────────────────
    const quoteHT  = (matelas?.price_ht || 399) + (sommier?.price_ht || 199)
    const quoteTVA = quoteHT * 0.2
    const quoteTTC = quoteHT + quoteTVA

    const { data: quote } = await supabase
      .from('quotes')
      .insert({
        workspace_id: workspaceId,
        customer_id: customer1?.id,
        status: 'envoye',
        total_ht: quoteHT,
        total_tva: quoteTVA,
        total_ttc: quoteTTC,
        issue_date: daysAgo(3),
        expiry_date: daysAgo(-27),
        notes: `${TUTORIAL_PREFIX} Devis de démonstration`,
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

    // ── 5. Order 1 — confirme avec acompte (recent) ──────────────────────────
    let order1 = null
    try {
      const o1HT  = quoteHT
      const o1TVA = quoteTVA
      const o1TTC = quoteTTC
      const acompte  = Math.round(o1TTC * 0.3 * 100) / 100
      const remaining = Math.round((o1TTC - acompte) * 100) / 100

      const { data: o1 } = await supabase
        .from('orders')
        .insert({
          workspace_id: workspaceId,
          customer_id: customer1?.id,
          order_type: 'standard',
          status: 'confirme',
          source: quote?.id ? 'from_quote' : 'direct',
          quote_id: quote?.id || null,
          subtotal_ht: o1HT,
          total_tva: o1TVA,
          total_ttc: o1TTC,
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

      if (order1?.id) {
        const oItems = []
        if (matelas) oItems.push({ order_id: order1.id, product_id: matelas.id, description: matelas.name, quantity: 1, unit_price_ht: matelas.price_ht, cost_price_ht: matelas.cost_price_ht || 0, tax_rate: 20, total_ht: matelas.price_ht, position: 1 })
        if (sommier) oItems.push({ order_id: order1.id, product_id: sommier.id, description: sommier.name, quantity: 1, unit_price_ht: sommier.price_ht, cost_price_ht: sommier.cost_price_ht || 0, tax_rate: 20, total_ht: sommier.price_ht, position: 2 })
        if (oItems.length > 0) await supabase.from('order_items').insert(oItems)

        await supabase.from('payments').insert({
          workspace_id: workspaceId,
          order_id: order1.id,
          payment_type: 'deposit',
          payment_method: 'card',
          amount: acompte,
          payment_date: daysAgo(1),
          received_by: userId,
          notes: `${TUTORIAL_PREFIX} Acompte démonstration`,
        })

        await supabase.from('deliveries').insert({
          workspace_id: workspaceId,
          order_id: order1.id,
          status: 'planifiee',
          scheduled_date: daysAgo(-7),
          delivery_type: 'delivery',
          delivery_address: '12 avenue du Tutoriel, 75001 Paris',
          notes: `${TUTORIAL_PREFIX} Livraison démonstration`,
          created_by: userId,
        })

        await supabase.from('invoices').insert({
          workspace_id: workspaceId,
          customer_id: customer1?.id,
          order_id: order1.id,
          invoice_category: 'deposit',
          status: 'envoyee',
          total_ht: Math.round(acompte / 1.2 * 100) / 100,
          total_tva: Math.round((acompte - acompte / 1.2) * 100) / 100,
          total_ttc: acompte,
          issue_date: daysAgo(1),
          notes: `${TUTORIAL_PREFIX} Facture acompte démonstration`,
          created_by: userId,
        })
      }
    } catch (e) {
      console.warn('[onboarding] order1 error (may need SQL migration):', e.message)
    }

    // ── 6. Order 2 — vente rapide terminée ──────────────────────────────────
    try {
      const o2HT  = (oreiller?.price_ht || 39) * 2
      const o2TTC = o2HT * 1.2

      const { data: o2 } = await supabase
        .from('orders')
        .insert({
          workspace_id: workspaceId,
          customer_id: customer2?.id,
          order_type: 'quick_sale',
          status: 'termine',
          source: 'direct',
          subtotal_ht: o2HT,
          total_tva: o2HT * 0.2,
          total_ttc: o2TTC,
          amount_paid: o2TTC,
          remaining_amount: 0,
          requires_delivery: false,
          notes: `${TUTORIAL_PREFIX} Vente rapide terminée`,
          created_by: userId,
        })
        .select()
        .single()

      if (o2?.id) {
        if (oreiller) await supabase.from('order_items').insert({ order_id: o2.id, product_id: oreiller.id, description: oreiller.name, quantity: 2, unit_price_ht: oreiller.price_ht, cost_price_ht: oreiller.cost_price_ht || 0, tax_rate: 20, total_ht: o2HT, position: 1 })
        await supabase.from('payments').insert({ workspace_id: workspaceId, order_id: o2.id, payment_type: 'full', payment_method: 'cash', amount: o2TTC, payment_date: daysAgo(2), received_by: userId, notes: `${TUTORIAL_PREFIX} Paiement complet` })
      }
    } catch (e) { console.warn('[onboarding] order2 error:', e.message) }

    // ── 7. Historical invoices for statistics (6 months) ────────────────────
    // Ces factures peuplent les graphiques mensuels du DashboardFinancier
    const historicalInvoices = [
      // Mois -5
      { customer_id: customer2?.id, total_ht: 520, issue_date: monthsAgo(5, 8), label: 'Vente matelas+sommier' },
      { customer_id: customer3?.id, total_ht: 280, issue_date: monthsAgo(5, 18), label: 'Vente matelas' },
      // Mois -4
      { customer_id: customer1?.id, total_ht: 750, issue_date: monthsAgo(4, 5), label: 'Chambre complète' },
      { customer_id: customer2?.id, total_ht: 160, issue_date: monthsAgo(4, 20), label: 'Accessoires' },
      { customer_id: customer3?.id, total_ht: 399, issue_date: monthsAgo(4, 25), label: 'Matelas seul' },
      // Mois -3
      { customer_id: customer1?.id, total_ht: 890, issue_date: monthsAgo(3, 10), label: 'Kit literie premium' },
      { customer_id: customer2?.id, total_ht: 440, issue_date: monthsAgo(3, 15), label: 'Sommier + oreillers' },
      { customer_id: customer3?.id, total_ht: 320, issue_date: monthsAgo(3, 22), label: 'Matelas enfant' },
      { customer_id: customer1?.id, total_ht: 199, issue_date: monthsAgo(3, 28), label: 'Sommier simple' },
      // Mois -2
      { customer_id: customer3?.id, total_ht: 650, issue_date: monthsAgo(2, 3), label: 'Literie hôtel' },
      { customer_id: customer2?.id, total_ht: 1100, issue_date: monthsAgo(2, 12), label: 'Commande grossiste' },
      { customer_id: customer1?.id, total_ht: 475, issue_date: monthsAgo(2, 19), label: 'Chambre parentale' },
      { customer_id: customer3?.id, total_ht: 280, issue_date: monthsAgo(2, 26), label: 'Oreillers lot x6' },
      // Mois -1
      { customer_id: customer2?.id, total_ht: 820, issue_date: monthsAgo(1, 6), label: 'Suite complète' },
      { customer_id: customer1?.id, total_ht: 598, issue_date: monthsAgo(1, 14), label: 'Matelas double + couettes' },
      { customer_id: customer3?.id, total_ht: 390, issue_date: monthsAgo(1, 21), label: 'Sommier électrique' },
      { customer_id: customer2?.id, total_ht: 240, issue_date: monthsAgo(1, 27), label: 'Protections literie' },
      // Mois courant
      { customer_id: customer1?.id, total_ht: 960, issue_date: daysAgo(12), label: 'Rénovation chambre' },
      { customer_id: customer3?.id, total_ht: 450, issue_date: daysAgo(7), label: 'Matelas latex' },
      { customer_id: customer2?.id, total_ht: 310, issue_date: daysAgo(3), label: 'Oreillers + protège-matelas' },
    ]

    for (const inv of historicalInvoices) {
      const tva  = Math.round(inv.total_ht * 0.2 * 100) / 100
      const ttc  = inv.total_ht + tva
      try {
        await supabase.from('invoices').insert({
          workspace_id: workspaceId,
          customer_id: inv.customer_id,
          status: 'payee',
          total_ht: inv.total_ht,
          total_tva: tva,
          total_ttc: ttc,
          issue_date: inv.issue_date,
          notes: `${TUTORIAL_PREFIX} ${inv.label}`,
          created_by: userId,
        })
      } catch { /* ignore individual failures */ }
    }

    console.log('[onboarding] Test data created successfully')
    return true
  } catch (err) {
    console.error('[onboarding] Error creating test data:', err)
    return false
  }
}

/**
 * Delete ALL tutorial data including data the user may have created during the tutorial.
 * Safe for new workspaces (no pre-existing real data).
 */
export async function deleteTestData(workspaceId) {
  try {
    const tutorialStartedAt = getTutorialStartTime()

    // ── Helper: delete records created after tutorial start ─────────────────
    async function deleteAfterStart(table, extraFilter = null) {
      if (!tutorialStartedAt) return
      try {
        let q = supabase.from(table).delete().eq('workspace_id', workspaceId).gte('created_at', tutorialStartedAt)
        if (extraFilter) q = extraFilter(q)
        await q
      } catch { /* table may not exist */ }
    }

    // ── 1. Find tutorial-prefixed records ────────────────────────────────────

    // Products (collected later in step 5 with a unified query)

    // Orders (by notes prefix)
    let orderIds = []
    try {
      const { data: tutOrders } = await supabase
        .from('orders').select('id').eq('workspace_id', workspaceId).like('notes', `${TUTORIAL_PREFIX}%`)
      orderIds = (tutOrders || []).map(o => o.id)

      // Also: orders created after tutorial start (user-created during tutorial)
      if (tutorialStartedAt) {
        const { data: recentOrders } = await supabase
          .from('orders').select('id').eq('workspace_id', workspaceId).gte('created_at', tutorialStartedAt)
        const recentIds = (recentOrders || []).map(o => o.id)
        orderIds = [...new Set([...orderIds, ...recentIds])]
      }
    } catch { /* table may not exist */ }

    // Quotes
    const { data: tutQuotes } = await supabase
      .from('quotes').select('id').eq('workspace_id', workspaceId).like('notes', `${TUTORIAL_PREFIX}%`)
    let quoteIds = (tutQuotes || []).map(q => q.id)
    if (tutorialStartedAt) {
      const { data: recentQuotes } = await supabase
        .from('quotes').select('id').eq('workspace_id', workspaceId).gte('created_at', tutorialStartedAt)
      quoteIds = [...new Set([...quoteIds, ...(recentQuotes || []).map(q => q.id)])]
    }

    // Invoices
    const { data: tutInvoices } = await supabase
      .from('invoices').select('id').eq('workspace_id', workspaceId).like('notes', `${TUTORIAL_PREFIX}%`)
    let invoiceIds = (tutInvoices || []).map(i => i.id)
    if (tutorialStartedAt) {
      const { data: recentInvoices } = await supabase
        .from('invoices').select('id').eq('workspace_id', workspaceId).gte('created_at', tutorialStartedAt)
      invoiceIds = [...new Set([...invoiceIds, ...(recentInvoices || []).map(i => i.id)])]
    }

    // ── 2. Delete orders + related ───────────────────────────────────────────
    if (orderIds.length > 0) {
      try {
        await supabase.from('payments').delete().in('order_id', orderIds)
        await supabase.from('deliveries').delete().in('order_id', orderIds)
        await supabase.from('order_items').delete().in('order_id', orderIds)
        await supabase.from('orders').delete().in('id', orderIds)
      } catch { /* tables may not exist */ }
    }

    // Also delete any payments/deliveries created after start not linked to above orders
    await deleteAfterStart('payments')
    await deleteAfterStart('deliveries')

    // ── 3. Delete quotes ─────────────────────────────────────────────────────
    if (quoteIds.length > 0) {
      await supabase.from('quote_items').delete().in('quote_id', quoteIds)
      await supabase.from('quotes').delete().in('id', quoteIds)
    }

    // ── 4. Delete invoices ───────────────────────────────────────────────────
    if (invoiceIds.length > 0) {
      try { await supabase.from('invoice_items').delete().in('invoice_id', invoiceIds) } catch { /* no items table */ }
      await supabase.from('invoices').delete().in('id', invoiceIds)
    }

    // Also delete any invoices created after start not caught above
    if (tutorialStartedAt) {
      try {
        const { data: leftoverInvoices } = await supabase
          .from('invoices').select('id').eq('workspace_id', workspaceId).gte('created_at', tutorialStartedAt)
        const leftoverIds = (leftoverInvoices || []).map(i => i.id)
        if (leftoverIds.length > 0) {
          try { await supabase.from('invoice_items').delete().in('invoice_id', leftoverIds) } catch { /* ok */ }
          await supabase.from('invoices').delete().in('id', leftoverIds)
        }
      } catch { /* ok */ }
    }

    // ── 5. Delete products + stock ───────────────────────────────────────────
    // By prefix
    const { data: allTutProducts } = await supabase
      .from('products').select('id').eq('workspace_id', workspaceId).like('name', `${TUTORIAL_PREFIX}%`)
    let allProductIds = (allTutProducts || []).map(p => p.id)

    // + products created after tutorial start (user-created during tutorial)
    if (tutorialStartedAt) {
      const { data: recentProducts } = await supabase
        .from('products').select('id').eq('workspace_id', workspaceId).gte('created_at', tutorialStartedAt)
      allProductIds = [...new Set([...allProductIds, ...(recentProducts || []).map(p => p.id)])]
    }

    if (allProductIds.length > 0) {
      try {
        await supabase.from('stock_movements').delete().in('product_id', allProductIds)
        await supabase.from('stock_levels').delete().in('product_id', allProductIds)
      } catch { /* ok */ }
      await supabase.from('products').delete().in('id', allProductIds)
    }

    // ── 6. Delete customers ──────────────────────────────────────────────────
    // By first_name prefix
    await supabase.from('customers').delete().eq('workspace_id', workspaceId).eq('first_name', TUTORIAL_PREFIX)
    await supabase.from('customers').delete().eq('workspace_id', workspaceId).like('first_name', `${TUTORIAL_PREFIX}%`)

    // + customers created after tutorial start
    if (tutorialStartedAt) {
      try {
        await supabase.from('customers').delete().eq('workspace_id', workspaceId).gte('created_at', tutorialStartedAt)
      } catch { /* ok */ }
    }

    // Clear tutorial start time
    localStorage.removeItem('neoflow_tutorial_started_at')

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
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', userId)
  } catch { /* profiles table might not have the column yet */ }
}

/**
 * Returns true if the tour should be displayed
 */
export function shouldShowOnboarding() {
  return !localStorage.getItem('neoflow_onboarding_done')
}
