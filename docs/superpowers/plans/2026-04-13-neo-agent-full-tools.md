# Neo Agent — Full Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Étendre Neo de 7 à 32 outils (tout ce que l'app sait faire), ajouter le bouton "Autre" dans la carte d'approbation, et implémenter la navigation avec scroll vers section.

**Architecture:** L'Edge Function `neo-chat/index.ts` gère les 31 outils serveur (13 lecture auto + 18 écriture avec approbation). L'outil `navigate_to` est géré côté frontend via un event SSE `__navigate` dédié émis par l'Edge Function. La carte d'approbation existante reçoit un 3ème bouton "Autre" qui ouvre un textarea inline.

**Tech Stack:** Deno/TypeScript (Edge Function Supabase), React 19 + Vite 7, Supabase JS v2, OpenRouter API (function calling format)

**Spec :** `docs/superpowers/specs/2026-04-13-neo-agent-full-tools-design.md`

---

## Fichiers modifiés

| Fichier | Rôle |
|---------|------|
| `supabase/functions/neo-chat/index.ts` | Tous les outils LLM, executeTool(), executeApprovedActionInline(), system prompt |
| `src/lib/supabase.js` | `streamNeoChat` : +2 handlers SSE (`__navigate`, `tool_executing: null`) |
| `src/components/NeoChat.jsx` | Bouton "Autre" + `handleOther()` + handler `navigate` dans `onMeta` |

---

## Task 1 — Nouveaux outils lecture dans `executeTool()`

**Fichiers :**
- Modify: `supabase/functions/neo-chat/index.ts:391` (fin du switch dans `executeTool`)

- [ ] **Ajouter les 9 nouveaux read tools dans `executeTool()`**

Dans `executeTool()`, avant le `default:` (ligne ~391), ajouter :

```typescript
      case 'get_order_details': {
        const { data: orders } = await supabase
          .from('orders')
          .select('id,order_number,status,total_ttc,amount_paid,remaining_amount,notes,delivery_type,created_at,customers(first_name,last_name,phone,email)')
          .eq('workspace_id', workspaceId)
          .ilike('order_number', `%${toolArgs.order_number || toolArgs.query || ''}%`)
          .limit(1)
        if (!orders?.length) return `Commande introuvable pour "${toolArgs.order_number || toolArgs.query}".`
        const o = orders[0]
        const { data: items } = await supabase.from('order_items').select('description,quantity,unit_price_ht,tax_rate,total_ht').eq('order_id', o.id)
        const { data: payments } = await supabase.from('payments').select('amount,payment_method,payment_date').eq('order_id', o.id)
        const client = o.customers ? `${o.customers.first_name||''} ${o.customers.last_name||''}`.trim() : '?'
        const lines = [
          `Commande ${o.order_number} — ${client} — ${o.status}`,
          `Total: ${o.total_ttc}€ | Payé: ${o.amount_paid||0}€ | Reste: ${o.remaining_amount||0}€`,
          `Livraison: ${o.delivery_type || 'none'}`,
          `Articles: ${(items||[]).map((i:any)=>`${i.description} x${i.quantity} @ ${i.unit_price_ht}€HT`).join(', ') || 'aucun'}`,
          `Paiements: ${(payments||[]).map((p:any)=>`${p.amount}€ (${p.payment_method})`).join(', ') || 'aucun'}`,
        ]
        if (o.notes) lines.push(`Notes: ${o.notes}`)
        return lines.join('\n')
      }

      case 'get_stock_levels': {
        const query = toolArgs.product_name
        let q = supabase.from('stock_levels')
          .select('quantity,reserved_quantity,min_quantity,products(name,category),stock_locations(name)')
          .eq('workspace_id', workspaceId)
        if (query) q = q.ilike('products.name', `%${query}%`)
        const { data } = await q.limit(15)
        if (!data?.length) return 'Aucun niveau de stock trouvé.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map(s => {
          const avail = (s.quantity||0) - (s.reserved_quantity||0)
          const alert = avail <= (s.min_quantity||3) ? (avail===0?'🔴 RUPTURE':'🟡 Faible') : '🟢'
          return `${alert} ${s.products?.name||'?'} | ${s.stock_locations?.name||'Principal'} | Dispo: ${avail} (total: ${s.quantity||0}, réservé: ${s.reserved_quantity||0}, min: ${s.min_quantity||3})`
        }).join('\n')
      }

      case 'search_invoices': {
        let q = supabase.from('invoices')
          .select('invoice_number,status,total_ttc,issue_date,invoice_category,customers(first_name,last_name)')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(toolArgs.limit || 8)
        if (toolArgs.status) q = q.eq('status', toolArgs.status)
        if (toolArgs.query) q = q.ilike('invoice_number', `%${toolArgs.query}%`)
        const { data } = await q
        if (!data?.length) return 'Aucune facture trouvée.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map(f => {
          const c = f.customers ? `${f.customers.first_name||''} ${f.customers.last_name||''}`.trim() : '?'
          return `${f.invoice_number} | ${c} | ${f.status} | ${f.total_ttc}€ | ${f.issue_date||'?'}`
        }).join('\n')
      }

      case 'search_quotes': {
        let q = supabase.from('quotes')
          .select('quote_number,status,total_ttc,valid_until,customers(first_name,last_name)')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(toolArgs.limit || 8)
        if (toolArgs.status) q = q.eq('status', toolArgs.status)
        if (toolArgs.query) q = q.ilike('quote_number', `%${toolArgs.query}%`)
        const { data } = await q
        if (!data?.length) return 'Aucun devis trouvé.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map(d => {
          const c = d.customers ? `${d.customers.first_name||''} ${d.customers.last_name||''}`.trim() : '?'
          return `${d.quote_number} | ${c} | ${d.status} | ${d.total_ttc}€ | Valide jusqu'au ${d.valid_until||'?'}`
        }).join('\n')
      }

      case 'search_deliveries': {
        let q = supabase.from('deliveries')
          .select('id,status,scheduled_date,time_slot,delivery_type,orders(order_number,total_ttc,customers(first_name,last_name))')
          .eq('workspace_id', workspaceId)
          .order('scheduled_date', { ascending: true, nullsFirst: true })
          .limit(toolArgs.limit || 10)
        if (toolArgs.status) q = q.eq('status', toolArgs.status)
        if (toolArgs.date) q = q.gte('scheduled_date', toolArgs.date)
        const { data } = await q
        if (!data?.length) return 'Aucune livraison trouvée.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map(d => {
          const o = d.orders
          const c = o?.customers ? `${o.customers.first_name||''} ${o.customers.last_name||''}`.trim() : '?'
          return `${o?.order_number||'?'} | ${c} | ${d.status} | ${d.scheduled_date||'non planifiée'} ${d.time_slot||''} | ${d.delivery_type}`
        }).join('\n')
      }

      case 'list_sav_tickets': {
        let q = supabase.from('sav_tickets')
          .select('ticket_number,status,type,priority,description,created_at,customers(first_name,last_name),orders(order_number)')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(toolArgs.limit || 10)
        if (toolArgs.status) q = q.eq('status', toolArgs.status)
        else q = q.not('status', 'in', '(resolu,ferme)')
        const { data } = await q
        if (!data?.length) return 'Aucun ticket SAV trouvé.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map(t => {
          const c = t.customers ? `${t.customers.first_name||''} ${t.customers.last_name||''}`.trim() : '?'
          return `${t.ticket_number} | ${c} | ${t.status} | ${t.priority} | ${t.type} | ${t.orders?.order_number||'?'} | ${t.description?.slice(0,60)||''}`
        }).join('\n')
      }

      case 'get_financial_summary': {
        const now = new Date()
        const startDate = toolArgs.start_date || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const endDate = toolArgs.end_date || now.toISOString().split('T')[0]
        const [paymentsData, pendingData] = await Promise.all([
          supabase.from('payments').select('amount').eq('workspace_id', workspaceId).gte('payment_date', startDate).lte('payment_date', endDate),
          supabase.from('orders').select('remaining_amount').eq('workspace_id', workspaceId).not('status','in','(termine,annule)'),
        ])
        // deno-lint-ignore no-explicit-any
        const ca = ((paymentsData.data||[]) as any[]).reduce((s:number,p:any)=>s+(p.amount||0),0)
        // deno-lint-ignore no-explicit-any
        const pending = ((pendingData.data||[]) as any[]).reduce((s:number,o:any)=>s+(o.remaining_amount||0),0)
        return `Période: ${startDate} → ${endDate}\nCA encaissé: ${Math.round(ca*100)/100}€\nSoldes en attente: ${Math.round(pending*100)/100}€`
      }

      case 'search_suppliers': {
        let q = supabase.from('suppliers')
          .select('name,contact_name,email,phone')
          .eq('workspace_id', workspaceId)
          .eq('is_archived', false)
          .order('name')
          .limit(10)
        if (toolArgs.query) q = q.ilike('name', `%${toolArgs.query}%`)
        const { data } = await q
        if (!data?.length) return 'Aucun fournisseur trouvé.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map(s => `${s.name}${s.contact_name?' — '+s.contact_name:''}${s.email?' | '+s.email:''}${s.phone?' | '+s.phone:''}`).join('\n')
      }

      case 'search_purchase_orders': {
        let q = supabase.from('purchase_orders')
          .select('po_number,status,total_amount,expected_date,suppliers(name)')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(10)
        if (toolArgs.status) q = q.eq('status', toolArgs.status)
        const { data } = await q
        if (!data?.length) return 'Aucun bon de commande trouvé.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map(p => `${p.po_number} | ${p.suppliers?.name||'?'} | ${p.status} | ${p.total_amount||0}€ | ${p.expected_date||'?'}`).join('\n')
      }

      case 'navigate_to': {
        const VALID_PATHS = [
          '/dashboard','/vente-rapide','/commandes','/commandes/nouvelle',
          '/factures','/factures/nouvelle','/devis','/devis/nouveau',
          '/clients','/produits','/stock','/stock/emplacements',
          '/fournisseurs','/bons-commande/nouveau','/livraisons',
          '/sav','/sav/nouveau','/dashboard-financier','/documentation','/settings',
        ]
        const path = toolArgs.path as string
        if (!VALID_PATHS.includes(path)) return `Route "${path}" inconnue. Routes valides: ${VALID_PATHS.join(', ')}`
        return JSON.stringify({ __navigate: path, __section: toolArgs.section || null })
      }
```

> ⚠️ **NE PAS COMMITTER ICI.** `navigate_to` retourne un marqueur JSON qui nécessite le code de Task 4 pour être transformé en event SSE. Committer Task 1 seul produirait du JSON brut visible dans la réponse LLM. Le commit combiné se fait à la fin de Task 4.

---

## Task 2 — Nouveaux outils écriture dans `executeApprovedActionInline()`

**Fichiers :**
- Modify: `supabase/functions/neo-chat/index.ts` (fin du switch dans `executeApprovedActionInline`)

- [ ] **Ajouter les 15 nouveaux write tools dans `executeApprovedActionInline()`**

Avant le `default:` dans `executeApprovedActionInline()`, ajouter :

```typescript
      case 'create_customer': {
        const { data, error } = await supabase.from('customers').insert({
          workspace_id: workspaceId,
          first_name: toolArgs.first_name,
          last_name: toolArgs.last_name,
          phone: toolArgs.phone || null,
          email: toolArgs.email || null,
          address: toolArgs.address || null,
          customer_type: toolArgs.customer_type || 'particulier',
          company_name: toolArgs.company_name || null,
          notes: toolArgs.notes || null,
        }).select('id').single()
        if (error) return `Erreur création client: ${error.message}`
        return `✅ Client ${toolArgs.first_name} ${toolArgs.last_name} créé (ID: ${data.id}).`
      }

      case 'update_customer': {
        const { data: found } = await supabase.from('customers')
          .select('id,first_name,last_name')
          .eq('workspace_id', workspaceId)
          .or(`first_name.ilike.%${toolArgs.query}%,last_name.ilike.%${toolArgs.query}%,phone.ilike.%${toolArgs.query}%`)
          .limit(1)
        if (!found?.length) return `Client "${toolArgs.query}" introuvable.`
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        const u = toolArgs.updates || {}
        if (u.first_name !== undefined) updates.first_name = u.first_name
        if (u.last_name !== undefined) updates.last_name = u.last_name
        if (u.phone !== undefined) updates.phone = u.phone
        if (u.email !== undefined) updates.email = u.email
        if (u.address !== undefined) updates.address = u.address
        if (u.notes !== undefined) updates.notes = u.notes
        const { error } = await supabase.from('customers').update(updates).eq('id', found[0].id)
        if (error) return `Erreur modification client: ${error.message}`
        return `✅ Client ${found[0].first_name} ${found[0].last_name} mis à jour.`
      }

      case 'create_order': {
        // Trouver/créer le client
        let customerId: string | null = null
        if (toolArgs.customer_name) {
          const parts = (toolArgs.customer_name as string).split(' ')
          const lastName = parts.pop() || ''
          const firstName = parts.join(' ') || lastName
          const { data: existing } = await supabase.from('customers')
            .select('id').eq('workspace_id', workspaceId)
            .or(`last_name.ilike.%${lastName}%,first_name.ilike.%${firstName}%`).limit(1)
          if (existing?.length) {
            customerId = existing[0].id
          } else if (toolArgs.customer_phone) {
            const { data: newC } = await supabase.from('customers').insert({
              workspace_id: workspaceId, first_name: firstName, last_name: lastName,
              phone: toolArgs.customer_phone, customer_type: 'particulier',
            }).select('id').single()
            customerId = newC?.id || null
          }
        }
        // Résoudre les produits
        const items = toolArgs.items as Array<{ product_name: string; quantity: number; unit_price?: number }>
        const resolvedItems = []
        let subtotalHt = 0
        for (const item of items || []) {
          const { data: prods } = await supabase.from('products')
            .select('id,name,unit_price_ht,tax_rate').eq('workspace_id', workspaceId)
            .ilike('name', `%${item.product_name}%`).limit(1)
          const prod = prods?.[0]
          if (!prod) continue
          const price = item.unit_price ?? prod.unit_price_ht ?? 0
          const lineHt = price * item.quantity
          subtotalHt += lineHt
          resolvedItems.push({ product_id: prod.id, description: prod.name, quantity: item.quantity, unit_price_ht: price, tax_rate: prod.tax_rate || 20, total_ht: lineHt })
        }
        if (!resolvedItems.length) return 'Aucun produit trouvé dans le catalogue pour cette commande.'
        const totalTva = resolvedItems.reduce((s, i) => s + i.total_ht * (i.tax_rate / 100), 0)
        const totalTtc = subtotalHt + totalTva
        const now = new Date().toISOString()
        const { data: order, error: oErr } = await supabase.from('orders').insert({
          workspace_id: workspaceId, customer_id: customerId,
          status: 'confirme', order_type: 'standard', source: 'neo',
          subtotal_ht: subtotalHt, total_tva: totalTva, total_ttc: totalTtc,
          amount_paid: 0, remaining_amount: totalTtc,
          delivery_type: toolArgs.delivery_type || 'none',
          requires_delivery: (toolArgs.delivery_type||'none') !== 'none',
          notes: toolArgs.notes || null, created_at: now, updated_at: now,
        }).select('id,order_number').single()
        if (oErr) return `Erreur création commande: ${oErr.message}`
        for (let i = 0; i < resolvedItems.length; i++) {
          await supabase.from('order_items').insert({ ...resolvedItems[i], order_id: order.id, position: i+1 })
        }
        return `✅ Commande ${order.order_number} créée pour ${toolArgs.customer_name||'client inconnu'} — Total: ${totalTtc.toFixed(2)}€`
      }

      case 'create_quote': {
        let customerId: string | null = null
        if (toolArgs.customer_name) {
          const parts = (toolArgs.customer_name as string).split(' ')
          const lastName = parts.pop() || ''
          const firstName = parts.join(' ') || lastName
          const { data: existing } = await supabase.from('customers')
            .select('id').eq('workspace_id', workspaceId)
            .or(`last_name.ilike.%${lastName}%,first_name.ilike.%${firstName}%`).limit(1)
          if (existing?.length) customerId = existing[0].id
          else if (toolArgs.customer_phone) {
            const { data: newC } = await supabase.from('customers').insert({
              workspace_id: workspaceId, first_name: firstName, last_name: lastName,
              phone: toolArgs.customer_phone, customer_type: 'particulier',
            }).select('id').single()
            customerId = newC?.id || null
          }
        }
        const items = toolArgs.items as Array<{ product_name: string; quantity: number; unit_price?: number }>
        const resolvedItems = []
        let subtotalHt = 0
        for (const item of items || []) {
          const { data: prods } = await supabase.from('products')
            .select('id,name,unit_price_ht,tax_rate').eq('workspace_id', workspaceId)
            .ilike('name', `%${item.product_name}%`).limit(1)
          const prod = prods?.[0]
          if (!prod) continue
          const price = item.unit_price ?? prod.unit_price_ht ?? 0
          const lineHt = price * item.quantity
          subtotalHt += lineHt
          resolvedItems.push({ product_id: prod.id, description: prod.name, quantity: item.quantity, unit_price_ht: price, tax_rate: prod.tax_rate || 20, total_ht: lineHt })
        }
        if (!resolvedItems.length) return 'Aucun produit trouvé.'
        const totalTva = resolvedItems.reduce((s, i) => s + i.total_ht * (i.tax_rate / 100), 0)
        const totalTtc = subtotalHt + totalTva
        const validUntil = new Date(Date.now() + (toolArgs.valid_days || 30) * 86400000).toISOString().split('T')[0]
        const now = new Date().toISOString()
        const { data: quote, error: qErr } = await supabase.from('quotes').insert({
          workspace_id: workspaceId, customer_id: customerId, status: 'draft',
          subtotal_ht: subtotalHt, total_tva: totalTva, total_ttc: totalTtc,
          valid_until: validUntil, notes: toolArgs.notes || null,
          created_at: now, updated_at: now,
        }).select('id,quote_number').single()
        if (qErr) return `Erreur création devis: ${qErr.message}`
        for (let i = 0; i < resolvedItems.length; i++) {
          await supabase.from('quote_items').insert({ ...resolvedItems[i], quote_id: quote.id, position: i+1 })
        }
        return `✅ Devis ${quote.quote_number} créé — Total: ${totalTtc.toFixed(2)}€ (valide jusqu'au ${validUntil})`
      }

      case 'update_quote_status': {
        const { data: quotes } = await supabase.from('quotes').select('id,quote_number,status')
          .eq('workspace_id', workspaceId).ilike('quote_number', `%${toolArgs.quote_number}%`).limit(1)
        if (!quotes?.length) return `Devis "${toolArgs.quote_number}" introuvable.`
        const quote = quotes[0]
        const actionMap: Record<string, string> = { accept: 'accepted', reject: 'rejected', convert_to_order: 'accepted' }
        const newStatus = actionMap[toolArgs.action] || toolArgs.action
        const { error } = await supabase.from('quotes').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', quote.id)
        if (error) return `Erreur: ${error.message}`
        return `✅ Devis ${quote.quote_number} passé en "${newStatus}".${toolArgs.action==='convert_to_order'?' Utilisez l\'interface pour finaliser la conversion en commande.':''}`
      }

      case 'generate_invoice': {
        const { data: orders } = await supabase.from('orders').select('id,order_number')
          .eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const order = orders[0]
        // Appeler la fonction generate-pdf via supabase functions
        const category = toolArgs.invoice_type || 'standard'
        // Insertion directe facture
        const { data: orderFull } = await supabase.from('orders')
          .select('customer_id,subtotal_ht,total_tva,total_ttc,amount_paid,discount_global')
          .eq('id', order.id).single()
        if (!orderFull) return 'Impossible de récupérer les données de la commande.'
        const now = new Date().toISOString()
        const { data: inv, error: invErr } = await supabase.from('invoices').insert({
          workspace_id: workspaceId, order_id: order.id,
          customer_id: orderFull.customer_id,
          status: category === 'deposit' ? 'brouillon' : 'emise',
          invoice_category: category,
          total_ttc: category === 'deposit' ? (orderFull.amount_paid || 0) : (orderFull.total_ttc || 0),
          total_tva: orderFull.total_tva || 0, subtotal_ht: orderFull.subtotal_ht || 0,
          discount_global: orderFull.discount_global || 0,
          issue_date: now.split('T')[0], created_at: now, updated_at: now,
        }).select('id,invoice_number').single()
        if (invErr) return `Erreur génération facture: ${invErr.message}`
        return `✅ Facture ${inv.invoice_number} (${category}) générée pour ${order.order_number}.`
      }

      case 'record_payment': {
        const { data: orders } = await supabase.from('orders').select('id,order_number,total_ttc,amount_paid,remaining_amount,status')
          .eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const order = orders[0]
        const amount = parseFloat(toolArgs.amount) || 0
        if (amount <= 0) return 'Montant invalide.'
        const now = new Date().toISOString()
        const { error } = await supabase.from('payments').insert({
          workspace_id: workspaceId, order_id: order.id,
          amount, payment_method: toolArgs.payment_method || 'cash',
          payment_date: now.split('T')[0], notes: toolArgs.notes || null,
        })
        if (error) return `Erreur enregistrement paiement: ${error.message}`
        const newPaid = (order.amount_paid || 0) + amount
        const newRemaining = Math.max(0, (order.total_ttc || 0) - newPaid)
        const newStatus = newRemaining <= 0.01 ? 'termine' : order.status
        await supabase.from('orders').update({ amount_paid: newPaid, remaining_amount: newRemaining, status: newStatus, updated_at: now }).eq('id', order.id)
        return `✅ Paiement de ${amount}€ (${toolArgs.payment_method||'espèces'}) enregistré sur ${order.order_number}.${newRemaining<=0.01?' Commande soldée !':` Reste: ${newRemaining.toFixed(2)}€`}`
      }

      case 'create_sav_ticket': {
        const { data: orders } = await supabase.from('orders').select('id,order_number,customer_id')
          .eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const order = orders[0]
        const now = new Date().toISOString()
        const { data: ticket, error } = await supabase.from('sav_tickets').insert({
          workspace_id: workspaceId, order_id: order.id, customer_id: order.customer_id,
          type: toolArgs.type || 'reclamation', priority: toolArgs.priority || 'normale',
          status: 'ouvert', description: toolArgs.description || '',
          created_at: now, updated_at: now,
        }).select('id,ticket_number').single()
        if (error) return `Erreur création SAV: ${error.message}`
        return `✅ Ticket SAV ${ticket.ticket_number} créé (${toolArgs.type||'réclamation'}, priorité ${toolArgs.priority||'normale'}).`
      }

      case 'update_sav_status': {
        const { data: tickets } = await supabase.from('sav_tickets').select('id,ticket_number')
          .eq('workspace_id', workspaceId).ilike('ticket_number', `%${toolArgs.ticket_number}%`).limit(1)
        if (!tickets?.length) return `Ticket SAV "${toolArgs.ticket_number}" introuvable.`
        const t = tickets[0]
        const { error } = await supabase.from('sav_tickets').update({ status: toolArgs.new_status, updated_at: new Date().toISOString() }).eq('id', t.id)
        if (error) return `Erreur: ${error.message}`
        return `✅ Ticket ${t.ticket_number} passé en "${toolArgs.new_status}".`
      }

      case 'adjust_stock': {
        let locId: string | null = null
        if (toolArgs.location_name) {
          const { data: locs } = await supabase.from('stock_locations').select('id').eq('workspace_id', workspaceId).ilike('name', `%${toolArgs.location_name}%`).limit(1)
          locId = locs?.[0]?.id || null
        } else {
          const { data: locs } = await supabase.from('stock_locations').select('id').eq('workspace_id', workspaceId).eq('is_default', true).limit(1)
          locId = locs?.[0]?.id || null
        }
        const { data: prods } = await supabase.from('products').select('id,name').eq('workspace_id', workspaceId).ilike('name', `%${toolArgs.product_name}%`).limit(1)
        if (!prods?.length) return `Produit "${toolArgs.product_name}" introuvable.`
        const prod = prods[0]
        if (!locId) return 'Emplacement de stock introuvable.'
        const newQty = parseInt(toolArgs.new_quantity) || 0
        const { data: existing } = await supabase.from('stock_levels').select('id,quantity').eq('product_id', prod.id).eq('location_id', locId).limit(1)
        if (existing?.length) {
          await supabase.from('stock_levels').update({ quantity: newQty, updated_at: new Date().toISOString() }).eq('id', existing[0].id)
        } else {
          await supabase.from('stock_levels').insert({ workspace_id: workspaceId, product_id: prod.id, location_id: locId, quantity: newQty })
        }
        await supabase.from('stock_movements').insert({ workspace_id: workspaceId, product_id: prod.id, location_id: locId, type: 'adjustment', quantity: newQty, notes: toolArgs.reason || 'Ajustement Neo' })
        return `✅ Stock de "${prod.name}" ajusté à ${newQty} unités.`
      }

      case 'update_delivery': {
        const { data: deliveries } = await supabase.from('deliveries')
          .select('id,orders(order_number)').eq('workspace_id', workspaceId)
          .eq('orders.order_number', toolArgs.order_number).limit(1)
        // Fallback: search by order_number via join
        let delivId: string | null = null
        if (deliveries?.length) {
          delivId = deliveries[0].id
        } else {
          const { data: orders } = await supabase.from('orders').select('id').eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
          if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
          const { data: d } = await supabase.from('deliveries').select('id').eq('order_id', orders[0].id).neq('status','annulee').limit(1)
          delivId = d?.[0]?.id || null
        }
        if (!delivId) return `Aucune livraison active pour la commande "${toolArgs.order_number}".`
        const updates: Record<string,unknown> = { updated_at: new Date().toISOString() }
        const u = toolArgs.updates || {}
        if (u.scheduled_date) updates.scheduled_date = u.scheduled_date
        if (u.time_slot) updates.time_slot = u.time_slot
        if (u.notes) updates.notes = u.notes
        if (u.assigned_to_name) {
          const { data: members } = await supabase.from('profiles').select('id').ilike('full_name', `%${u.assigned_to_name}%`).limit(1)
          if (members?.[0]) updates.assigned_to = members[0].id
        }
        const { error } = await supabase.from('deliveries').update(updates).eq('id', delivId)
        if (error) return `Erreur: ${error.message}`
        return `✅ Livraison pour ${toolArgs.order_number} mise à jour.`
      }

      case 'create_product': {
        const now = new Date().toISOString()
        const { data: prod, error } = await supabase.from('products').insert({
          workspace_id: workspaceId,
          name: toolArgs.name,
          unit_price_ht: parseFloat(toolArgs.unit_price_ht) || 0,
          tax_rate: parseFloat(toolArgs.tax_rate) || 20,
          category: toolArgs.category || null,
          description: toolArgs.description || null,
          min_stock: parseInt(toolArgs.min_stock) || 3,
          is_archived: false, created_at: now, updated_at: now,
        }).select('id,name').single()
        if (error) return `Erreur création produit: ${error.message}`
        if (toolArgs.initial_stock && toolArgs.initial_stock > 0) {
          const { data: locs } = await supabase.from('stock_locations').select('id').eq('workspace_id', workspaceId).eq('is_default', true).limit(1)
          if (locs?.[0]) {
            await supabase.from('stock_levels').insert({ workspace_id: workspaceId, product_id: prod.id, location_id: locs[0].id, quantity: toolArgs.initial_stock, min_quantity: toolArgs.min_stock || 3 })
          }
        }
        return `✅ Produit "${prod.name}" créé (${toolArgs.unit_price_ht}€ HT, TVA ${toolArgs.tax_rate||20}%).`
      }

      case 'update_product': {
        const { data: prods } = await supabase.from('products').select('id,name').eq('workspace_id', workspaceId).ilike('name', `%${toolArgs.product_name}%`).limit(1)
        if (!prods?.length) return `Produit "${toolArgs.product_name}" introuvable.`
        const prod = prods[0]
        const updates: Record<string,unknown> = { updated_at: new Date().toISOString() }
        const u = toolArgs.updates || {}
        if (u.name !== undefined) updates.name = u.name
        if (u.unit_price_ht !== undefined) updates.unit_price_ht = parseFloat(u.unit_price_ht)
        if (u.tax_rate !== undefined) updates.tax_rate = parseFloat(u.tax_rate)
        if (u.category !== undefined) updates.category = u.category
        if (u.description !== undefined) updates.description = u.description
        if (u.min_stock !== undefined) updates.min_stock = parseInt(u.min_stock)
        const { error } = await supabase.from('products').update(updates).eq('id', prod.id)
        if (error) return `Erreur: ${error.message}`
        return `✅ Produit "${prod.name}" mis à jour.`
      }

      case 'create_supplier': {
        const now = new Date().toISOString()
        const { data: supplier, error } = await supabase.from('suppliers').insert({
          workspace_id: workspaceId,
          name: toolArgs.name,
          contact_name: toolArgs.contact_name || null,
          email: toolArgs.email || null,
          phone: toolArgs.phone || null,
          address: toolArgs.address || null,
          notes: toolArgs.notes || null,
          is_archived: false, created_at: now, updated_at: now,
        }).select('id,name').single()
        if (error) return `Erreur création fournisseur: ${error.message}`
        return `✅ Fournisseur "${supplier.name}" créé.`
      }

      case 'create_purchase_order': {
        const { data: suppliers } = await supabase.from('suppliers').select('id,name').eq('workspace_id', workspaceId).ilike('name', `%${toolArgs.supplier_name}%`).limit(1)
        if (!suppliers?.length) return `Fournisseur "${toolArgs.supplier_name}" introuvable.`
        const supplier = suppliers[0]
        const items = toolArgs.items as Array<{ product_name: string; quantity: number; unit_price?: number }>
        const resolvedItems = []
        let totalAmount = 0
        for (const item of items || []) {
          const { data: prods } = await supabase.from('products').select('id,name,unit_price_ht').eq('workspace_id', workspaceId).ilike('name', `%${item.product_name}%`).limit(1)
          const prod = prods?.[0]
          if (!prod) continue
          const price = item.unit_price ?? prod.unit_price_ht ?? 0
          totalAmount += price * item.quantity
          resolvedItems.push({ product_id: prod.id, description: prod.name, quantity: item.quantity, unit_price: price, total: price * item.quantity })
        }
        if (!resolvedItems.length) return 'Aucun produit trouvé.'
        const now = new Date().toISOString()
        const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
          workspace_id: workspaceId, supplier_id: supplier.id, status: 'brouillon',
          total_amount: totalAmount,
          expected_date: toolArgs.expected_date || null, notes: toolArgs.notes || null,
          created_at: now, updated_at: now,
        }).select('id,po_number').single()
        if (poErr) return `Erreur création bon de commande: ${poErr.message}`
        for (let i = 0; i < resolvedItems.length; i++) {
          await supabase.from('purchase_order_items').insert({ ...resolvedItems[i], purchase_order_id: po.id })
        }
        return `✅ Bon de commande ${po.po_number} créé pour ${supplier.name} — Total: ${totalAmount.toFixed(2)}€`
      }
```

- [ ] **Commit**

```bash
git add supabase/functions/neo-chat/index.ts
git commit -m "feat(neo): add 15 new write tools to executeApprovedActionInline()"
```

---

## Task 3 — Définitions NEO_TOOLS[] et mise à jour APPROVAL_REQUIRED_TOOLS

**Fichiers :**
- Modify: `supabase/functions/neo-chat/index.ts:277` (fin du tableau `NEO_TOOLS`)

- [ ] **Ajouter les 25 nouvelles définitions d'outils dans `NEO_TOOLS[]`**

Avant le `]` fermant de `NEO_TOOLS`, ajouter :

```typescript
  // ── Nouveaux outils LECTURE ──
  { type:'function', function:{ name:'get_order_details', description:'Obtenir les détails complets d\'une commande : articles, paiements, livraison.', parameters:{ type:'object', properties:{ order_number:{ type:'string', description:'Numéro ou nom client' } } } } },
  { type:'function', function:{ name:'get_stock_levels', description:'Voir les niveaux de stock par produit et emplacement.', parameters:{ type:'object', properties:{ product_name:{ type:'string', description:'Nom du produit (optionnel)' } } } } },
  { type:'function', function:{ name:'search_invoices', description:'Chercher des factures par client, statut ou numéro.', parameters:{ type:'object', properties:{ query:{ type:'string' }, status:{ type:'string', description:'brouillon, emise, payee, annulee' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'search_quotes', description:'Chercher des devis ouverts ou par client.', parameters:{ type:'object', properties:{ query:{ type:'string' }, status:{ type:'string', description:'draft, sent, accepted, rejected, expired' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'search_deliveries', description:'Chercher des livraisons par statut ou date.', parameters:{ type:'object', properties:{ status:{ type:'string', description:'a_planifier, planifiee, en_cours, livree' }, date:{ type:'string', description:'YYYY-MM-DD — livraisons à partir de cette date' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'list_sav_tickets', description:'Lister les tickets SAV ouverts (ou par statut).', parameters:{ type:'object', properties:{ status:{ type:'string', description:'ouvert, en_cours, en_attente, resolu, ferme. Par défaut: tickets non résolus.' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'get_financial_summary', description:'Résumé financier: CA encaissé et soldes en attente sur une période.', parameters:{ type:'object', properties:{ start_date:{ type:'string', description:'YYYY-MM-DD, défaut: 1er du mois' }, end_date:{ type:'string', description:'YYYY-MM-DD, défaut: aujourd\'hui' } } } } },
  { type:'function', function:{ name:'search_suppliers', description:'Chercher des fournisseurs par nom.', parameters:{ type:'object', properties:{ query:{ type:'string' } } } } },
  { type:'function', function:{ name:'search_purchase_orders', description:'Chercher des bons de commande fournisseurs.', parameters:{ type:'object', properties:{ status:{ type:'string', description:'brouillon, envoye, confirme, recu, annule' } } } } },
  { type:'function', function:{ name:'navigate_to', description:'Naviguer vers une page de l\'application. Utilise UNIQUEMENT les routes listées dans le system prompt. Peut aussi naviguer vers une section spécifique de la page.', parameters:{ type:'object', required:['path'], properties:{ path:{ type:'string', description:'Route exacte ex: /commandes, /clients, /settings, /sav, /stock...' }, section:{ type:'string', description:'ID de section dans la page (optionnel) ex: subscription, account, workspace' } } } } },
  // ── Nouveaux outils ÉCRITURE ──
  { type:'function', function:{ name:'create_customer', description:'Ajouter un nouveau client. Requiert approbation.', parameters:{ type:'object', required:['first_name','last_name'], properties:{ first_name:{ type:'string' }, last_name:{ type:'string' }, phone:{ type:'string' }, email:{ type:'string' }, address:{ type:'string' }, customer_type:{ type:'string', description:'particulier ou pro' }, company_name:{ type:'string' }, notes:{ type:'string' } } } } },
  { type:'function', function:{ name:'update_customer', description:'Modifier les infos d\'un client existant. Requiert approbation.', parameters:{ type:'object', required:['query','updates'], properties:{ query:{ type:'string', description:'Nom ou téléphone du client' }, updates:{ type:'object', properties:{ first_name:{type:'string'}, last_name:{type:'string'}, phone:{type:'string'}, email:{type:'string'}, address:{type:'string'}, notes:{type:'string'} } } } } } },
  { type:'function', function:{ name:'create_order', description:'Créer une commande avec client et produits. Requiert approbation.', parameters:{ type:'object', required:['customer_name','items'], properties:{ customer_name:{ type:'string', description:'Prénom Nom du client' }, customer_phone:{ type:'string' }, items:{ type:'array', items:{ type:'object', required:['product_name','quantity'], properties:{ product_name:{type:'string'}, quantity:{type:'number'}, unit_price:{type:'number'} } } }, notes:{ type:'string' }, delivery_type:{ type:'string', description:'none, delivery ou pickup' } } } } },
  { type:'function', function:{ name:'create_quote', description:'Créer un devis. Requiert approbation.', parameters:{ type:'object', required:['customer_name','items'], properties:{ customer_name:{type:'string'}, customer_phone:{type:'string'}, items:{ type:'array', items:{ type:'object', required:['product_name','quantity'], properties:{ product_name:{type:'string'}, quantity:{type:'number'}, unit_price:{type:'number'} } } }, notes:{type:'string'}, valid_days:{type:'number',description:'Jours de validité, défaut: 30'} } } } },
  { type:'function', function:{ name:'update_quote_status', description:'Accepter, refuser ou convertir un devis en commande. Requiert approbation.', parameters:{ type:'object', required:['quote_number','action'], properties:{ quote_number:{type:'string'}, action:{type:'string',description:'accept, reject, ou convert_to_order'}, reason:{type:'string'} } } } },
  { type:'function', function:{ name:'generate_invoice', description:'Générer une facture depuis une commande existante. Requiert approbation.', parameters:{ type:'object', required:['order_number'], properties:{ order_number:{type:'string'}, invoice_type:{type:'string',description:'standard (défaut) ou deposit (acompte)'} } } } },
  { type:'function', function:{ name:'record_payment', description:'Enregistrer un paiement sur une commande. Requiert approbation.', parameters:{ type:'object', required:['order_number','amount'], properties:{ order_number:{type:'string'}, amount:{type:'number'}, payment_method:{type:'string',description:'cash, card, check, transfer, other'}, notes:{type:'string'} } } } },
  { type:'function', function:{ name:'create_sav_ticket', description:'Créer un ticket SAV lié à une commande. Requiert approbation.', parameters:{ type:'object', required:['order_number','description'], properties:{ order_number:{type:'string'}, type:{type:'string',description:'retour, reparation, echange, remboursement, reclamation'}, priority:{type:'string',description:'basse, normale, haute, urgente'}, description:{type:'string'} } } } },
  { type:'function', function:{ name:'update_sav_status', description:'Changer le statut d\'un ticket SAV. Requiert approbation.', parameters:{ type:'object', required:['ticket_number','new_status'], properties:{ ticket_number:{type:'string'}, new_status:{type:'string',description:'ouvert, en_cours, en_attente, resolu, ferme'}, comment:{type:'string'} } } } },
  { type:'function', function:{ name:'adjust_stock', description:'Ajuster la quantité de stock d\'un produit. Requiert approbation.', parameters:{ type:'object', required:['product_name','new_quantity'], properties:{ product_name:{type:'string'}, new_quantity:{type:'number',description:'Quantité absolue (pas un delta)'}, location_name:{type:'string',description:'Nom de l\'emplacement, défaut: principal'}, reason:{type:'string'} } } } },
  { type:'function', function:{ name:'update_delivery', description:'Modifier date, créneau ou livreur d\'une livraison. Requiert approbation.', parameters:{ type:'object', required:['order_number','updates'], properties:{ order_number:{type:'string'}, updates:{ type:'object', properties:{ scheduled_date:{type:'string',description:'YYYY-MM-DD'}, time_slot:{type:'string'}, assigned_to_name:{type:'string'}, notes:{type:'string'} } } } } } },
  { type:'function', function:{ name:'create_product', description:'Ajouter un produit au catalogue. Requiert approbation.', parameters:{ type:'object', required:['name','unit_price_ht'], properties:{ name:{type:'string'}, unit_price_ht:{type:'number'}, tax_rate:{type:'number',description:'Taux TVA %, défaut: 20'}, category:{type:'string'}, description:{type:'string'}, initial_stock:{type:'number',description:'Stock initial, défaut: 0'}, min_stock:{type:'number',description:'Seuil alerte, défaut: 3'} } } } },
  { type:'function', function:{ name:'update_product', description:'Modifier un produit existant. Requiert approbation.', parameters:{ type:'object', required:['product_name','updates'], properties:{ product_name:{type:'string'}, updates:{ type:'object', properties:{ name:{type:'string'}, unit_price_ht:{type:'number'}, tax_rate:{type:'number'}, category:{type:'string'}, description:{type:'string'}, min_stock:{type:'number'} } } } } } },
  { type:'function', function:{ name:'create_supplier', description:'Ajouter un fournisseur. Requiert approbation.', parameters:{ type:'object', required:['name'], properties:{ name:{type:'string'}, contact_name:{type:'string'}, email:{type:'string'}, phone:{type:'string'}, address:{type:'string'}, notes:{type:'string'} } } } },
  { type:'function', function:{ name:'create_purchase_order', description:'Créer un bon de commande fournisseur. Requiert approbation.', parameters:{ type:'object', required:['supplier_name','items'], properties:{ supplier_name:{type:'string'}, items:{ type:'array', items:{ type:'object', required:['product_name','quantity'], properties:{ product_name:{type:'string'}, quantity:{type:'number'}, unit_price:{type:'number'} } } }, expected_date:{type:'string',description:'YYYY-MM-DD'}, notes:{type:'string'} } } } },
```

- [ ] **Mettre à jour `APPROVAL_REQUIRED_TOOLS`**

Remplacer la ligne existante :
```typescript
const APPROVAL_REQUIRED_TOOLS = new Set(['update_order_status', 'cancel_order', 'create_delivery'])
```
Par :
```typescript
const APPROVAL_REQUIRED_TOOLS = new Set([
  'update_order_status', 'cancel_order', 'create_delivery',
  'create_order', 'create_customer', 'update_customer',
  'create_quote', 'update_quote_status', 'generate_invoice',
  'record_payment', 'create_sav_ticket', 'update_sav_status',
  'adjust_stock', 'update_delivery', 'create_product',
  'update_product', 'create_supplier', 'create_purchase_order',
])
```

- [ ] **Mettre à jour `getActionLabel()`**

Ajouter avant le `default:` dans `getActionLabel()` :

```typescript
    case 'create_customer':
      return { label: `Créer le client ${toolArgs.first_name} ${toolArgs.last_name}`, details: `Tél: ${toolArgs.phone||'—'} | Email: ${toolArgs.email||'—'} | Type: ${toolArgs.customer_type||'particulier'}` }
    case 'update_customer':
      return { label: `Modifier le client "${toolArgs.query}"`, details: JSON.stringify(toolArgs.updates||{}) }
    case 'create_order':
      return { label: `Créer une commande pour ${toolArgs.customer_name}`, details: `${(toolArgs.items||[]).length} article(s) | Livraison: ${toolArgs.delivery_type||'none'}` }
    case 'create_quote':
      return { label: `Créer un devis pour ${toolArgs.customer_name}`, details: `${(toolArgs.items||[]).length} article(s) | Validité: ${toolArgs.valid_days||30} jours` }
    case 'update_quote_status':
      return { label: `${toolArgs.action==='accept'?'Accepter':toolArgs.action==='reject'?'Refuser':'Convertir'} le devis ${toolArgs.quote_number}`, details: toolArgs.reason||'' }
    case 'generate_invoice':
      return { label: `Générer une facture ${toolArgs.invoice_type||'standard'} pour ${toolArgs.order_number}`, details: '' }
    case 'record_payment':
      return { label: `Enregistrer ${toolArgs.amount}€ (${toolArgs.payment_method||'espèces'}) sur ${toolArgs.order_number}`, details: toolArgs.notes||'' }
    case 'create_sav_ticket':
      return { label: `Créer ticket SAV pour ${toolArgs.order_number}`, details: `Type: ${toolArgs.type||'réclamation'} | Priorité: ${toolArgs.priority||'normale'} | ${(toolArgs.description||'').slice(0,60)}` }
    case 'update_sav_status':
      return { label: `Passer le ticket ${toolArgs.ticket_number} en "${toolArgs.new_status}"`, details: toolArgs.comment||'' }
    case 'adjust_stock':
      return { label: `Ajuster le stock de "${toolArgs.product_name}" à ${toolArgs.new_quantity} unités`, details: `Emplacement: ${toolArgs.location_name||'principal'} | Raison: ${toolArgs.reason||'—'}` }
    case 'update_delivery':
      return { label: `Modifier la livraison de ${toolArgs.order_number}`, details: JSON.stringify(toolArgs.updates||{}) }
    case 'create_product':
      return { label: `Ajouter le produit "${toolArgs.name}"`, details: `Prix HT: ${toolArgs.unit_price_ht}€ | TVA: ${toolArgs.tax_rate||20}% | Catégorie: ${toolArgs.category||'—'}` }
    case 'update_product':
      return { label: `Modifier le produit "${toolArgs.product_name}"`, details: JSON.stringify(toolArgs.updates||{}) }
    case 'create_supplier':
      return { label: `Ajouter le fournisseur "${toolArgs.name}"`, details: `Contact: ${toolArgs.contact_name||'—'} | ${toolArgs.email||''} | ${toolArgs.phone||''}` }
    case 'create_purchase_order':
      return { label: `Créer un bon de commande chez ${toolArgs.supplier_name}`, details: `${(toolArgs.items||[]).length} article(s) | Livraison prévue: ${toolArgs.expected_date||'non définie'}` }
```

- [ ] **Commit**

```bash
git add supabase/functions/neo-chat/index.ts
git commit -m "feat(neo): add 25 tool definitions, update APPROVAL_REQUIRED_TOOLS and getActionLabel()"
```

---

## Task 4 — Émettre `__navigate` SSE + clear `tool_executing`

**Fichiers :**
- Modify: `supabase/functions/neo-chat/index.ts:714-768` (section outil lecture dans handler principal)

- [ ] **Étape 1 — Déplacer `tool_executing` AVANT executeTool et supprimer l'ancienne ligne**

Dans le handler principal, localiser les deux lignes suivantes (ordre actuel dans le fichier) :

```typescript
// (ligne ~716)
const toolResult = await executeTool(supabase, workspaceId!, currentToolName, parsedArgs)
// (ligne ~719 — actuellement APRÈS executeTool, ce qui est incorrect)
await writer.write(encoder.encode(`data: ${JSON.stringify({ tool_executing: currentToolName })}\n\n`))
```

**Supprimer ces deux lignes** et les remplacer par :

```typescript
                    // Notifier le frontend que l'outil tourne (AVANT l'appel)
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ tool_executing: currentToolName })}\n\n`))

                    const toolResult = await executeTool(supabase, workspaceId!, currentToolName, parsedArgs)
```

> ⚠️ L'ancienne ligne `tool_executing` à ~719 **doit être supprimée** — elle ne doit plus exister. Si elle reste, le frontend reçoit deux émissions `tool_executing` consécutives.

- [ ] **Étape 2 — Détecter navigate_to et émettre le SSE dédié**

Immédiatement après la ligne `const toolResult = await executeTool(...)` ajoutée à l'étape 1, insérer :

```typescript
                    // Cas spécial navigate_to : émettre un event SSE dédié
                    if (currentToolName === 'navigate_to') {
                      try {
                        const nav = JSON.parse(toolResult)
                        if (nav.__navigate) {
                          await writer.write(encoder.encode(`data: ${JSON.stringify({ __navigate: nav.__navigate, __section: nav.__section || null })}\n\n`))
                        }
                      } catch { /* toolResult est une erreur texte (route invalide), pas de navigation */ }
                    }
```

- [ ] **Étape 3 — Clear tool_executing après la réponse**

Après le bloc qui stream les mots de la réponse (`for (const word of words) {...}`), ajouter :

```typescript
                      // Clear l'indicateur d'outil une fois la réponse streamée
                      await writer.write(encoder.encode(`data: ${JSON.stringify({ tool_executing: null })}\n\n`))
```

- [ ] **Commit combiné Tasks 1 + 4**

Ce commit inclut les changements de Task 1 (nouveaux read tools + navigate_to dans executeTool) ET les changements de Task 4 (émission SSE, clear tool_executing) dans un seul commit atomique :

```bash
git add supabase/functions/neo-chat/index.ts
git commit -m "feat(neo): add 9 new read tools + navigate_to, emit __navigate SSE, fix tool_executing order"
```

---

## Task 5 — Mettre à jour le system prompt

**Fichiers :**
- Modify: `supabase/functions/neo-chat/index.ts` (fonction `buildSystemPrompt`, variable `toolsBlock`)

- [ ] **Remplacer le `toolsBlock` pour lister tous les outils**

Remplacer la variable `toolsBlock` dans `buildSystemPrompt()` par :

```typescript
  const toolsBlock = isPro ? `
## Outils disponibles

**LECTURE (exécution directe, pas d'approbation) :**
- \`search_orders\` — commandes par numéro/statut/client
- \`get_order_details\` — détails complets d'une commande (articles, paiements)
- \`get_customer_info\` — fiche + historique d'un client
- \`search_products\` — produits du catalogue
- \`get_stock_alerts\` — alertes rupture / stock faible
- \`get_stock_levels\` — niveaux de stock par produit/emplacement
- \`search_invoices\` — factures par client/statut
- \`search_quotes\` — devis ouverts
- \`search_deliveries\` — livraisons par statut/date
- \`list_sav_tickets\` — tickets SAV ouverts
- \`get_financial_summary\` — CA et soldes sur une période
- \`search_suppliers\` — fournisseurs
- \`search_purchase_orders\` — bons de commande fournisseurs
- \`navigate_to\` — amener l'utilisateur sur une page (routes valides ci-dessous)

**ÉCRITURE (approbation utilisateur requise) :**
- \`create_order\` — créer une commande (client + produits)
- \`create_customer\` — ajouter un client
- \`update_customer\` — modifier un client
- \`create_quote\` — créer un devis
- \`update_quote_status\` — accepter/refuser/convertir un devis
- \`generate_invoice\` — générer une facture depuis une commande
- \`record_payment\` — enregistrer un paiement
- \`create_sav_ticket\` — créer un ticket SAV
- \`update_sav_status\` — changer statut SAV
- \`update_order_status\` — changer statut commande
- \`cancel_order\` — annuler une commande
- \`create_delivery\` — planifier une livraison
- \`update_delivery\` — modifier date/créneau/livreur d'une livraison
- \`adjust_stock\` — ajuster le stock d'un produit
- \`create_product\` — ajouter un produit au catalogue
- \`update_product\` — modifier un produit
- \`create_supplier\` — ajouter un fournisseur
- \`create_purchase_order\` — créer un bon de commande fournisseur

**Routes valides pour navigate_to :**
/dashboard, /vente-rapide, /commandes, /commandes/nouvelle, /factures, /factures/nouvelle, /devis, /devis/nouveau, /clients, /produits, /stock, /stock/emplacements, /fournisseurs, /bons-commande/nouveau, /livraisons, /sav, /sav/nouveau, /dashboard-financier, /documentation, /settings

**Sections disponibles par page :**
/settings → account, workspace, subscription, support

## Règles absolues

1. Pour toute question sur les données → utilise l'outil lecture correspondant. Ne te base pas sur le snapshot ci-dessous qui peut être périmé.
2. Pour toute action (écriture) → appelle l'outil **immédiatement**. Ne demande JAMAIS "tu veux que je fasse X ?" — le système d'approbation gère la confirmation.
3. navigate_to → utilise UNIQUEMENT les routes de la liste ci-dessus. N'invente pas de route.
4. Si un outil retourne vide → dis-le clairement sans inventer.` : `
## Mode basique
Tu n'as pas accès aux outils. Utilise uniquement les données ci-dessous.`
```

- [ ] **Commit**

```bash
git add supabase/functions/neo-chat/index.ts
git commit -m "feat(neo): update system prompt with all 32 tools and navigate_to routes"
```

---

## Task 6 — Mettre à jour `streamNeoChat` dans `supabase.js`

**Fichiers :**
- Modify: `src/lib/supabase.js:128-130`

- [ ] **Ajouter les 2 nouveaux handlers SSE**

Après la ligne `if (parsed.tool_executing && onMeta) onMeta({ tool_executing: parsed.tool_executing })`, ajouter :

```javascript
          if (parsed.__navigate && onMeta) onMeta({ navigate: parsed.__navigate, section: parsed.__section || null })
          if (parsed.tool_executing === null && onMeta) onMeta({ tool_executing: null })
```

- [ ] **Commit**

```bash
git add src/lib/supabase.js
git commit -m "feat(neo): streamNeoChat handles __navigate and tool_executing null SSE events"
```

---

## Task 7 — Bouton "Autre" dans `ActionApprovalCard`

**Fichiers :**
- Modify: `src/components/NeoChat.jsx:221-300` (composant `ActionApprovalCard`)

- [ ] **Ajouter l'état local et le bouton "Autre" dans `ActionApprovalCard`**

Remplacer la signature + les boutons du composant `ActionApprovalCard` :

```jsx
function ActionApprovalCard({ action, onApprove, onReject, onOther, isProcessing }) {
  const [showOtherInput, setShowOtherInput] = useState(false)
  const [otherText, setOtherText] = useState('')
  // ... (conserver le reste du composant tel quel jusqu'aux boutons)
```

Remplacer le bloc `{/* Buttons */}` (les 2 boutons existants) par :

```jsx
      {/* Buttons */}
      <div className="flex gap-2 px-4 pb-3">
        <button
          onClick={() => onApprove(action)}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {isProcessing ? 'Exécution…' : 'Approuver'}
        </button>
        <button
          onClick={() => onReject(action)}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-red-50 text-red-500 hover:text-red-600 text-sm font-semibold py-2 px-4 rounded-lg border border-red-200 transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Refuser
        </button>
        <button
          onClick={() => setShowOtherInput(v => !v)}
          disabled={isProcessing}
          className="flex items-center justify-center gap-1 bg-white hover:bg-gray-50 text-gray-600 text-sm font-semibold py-2 px-3 rounded-lg border border-gray-200 transition-colors disabled:opacity-50"
          title="Corriger l'instruction"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Autre
        </button>
      </div>

      {/* Textarea "Autre" */}
      {showOtherInput && (
        <div className="px-4 pb-4 space-y-2">
          <textarea
            value={otherText}
            onChange={e => setOtherText(e.target.value)}
            placeholder="Ex: Le client c'est Dubois pas Gérard…"
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] text-gray-800 placeholder-gray-400"
            autoFocus
          />
          <button
            onClick={() => { if (otherText.trim()) { onOther(action, otherText.trim()); setOtherText(''); setShowOtherInput(false) } }}
            disabled={!otherText.trim()}
            className="w-full flex items-center justify-center gap-1.5 bg-[#313ADF] text-white text-sm font-semibold py-2 px-4 rounded-lg hover:bg-[#2730c4] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            Envoyer
          </button>
        </div>
      )}
```

> ⚠️ **NE PAS COMMITTER ICI.** Le composant `ActionApprovalCard` appelle `onOther(action, text)` mais cette prop n'est passée qu'en Task 8. Committer Task 7 seul produirait un `TypeError: onOther is not a function` si l'utilisateur clique "Autre". Le commit combiné se fait à la fin de Task 8.

---

## Task 8 — `handleOther()` et handler `navigate` dans `onMeta`

**Fichiers :**
- Modify: `src/components/NeoChat.jsx:619-638` (après `handleRejectAction`)

- [ ] **Ajouter `handleOther` dans le composant principal `NeoChat`**

Après `handleRejectAction`, ajouter :

```jsx
  const handleOther = useCallback((action, text) => {
    setPendingAction(null)
    if (!activeChatId || !text.trim()) return
    // Construire le message avec contexte de l'action refusée
    const argsStr = Object.entries(action.tool_args || {}).map(([k, v]) => `${k}: ${v}`).join(', ')
    const contextMsg = `[Action refusée: ${action.tool_name} — ${argsStr}]\nInstruction corrigée : ${text.trim()}`
    sendMessage(contextMsg)
  }, [activeChatId, sendMessage])
```

- [ ] **Passer `onOther={handleOther}` à la carte d'approbation**

Localiser l'endroit où `ActionApprovalCard` est rendu (rechercher `ActionApprovalCard` dans le JSX du composant principal), et ajouter la prop `onOther` :

```jsx
<ActionApprovalCard
  action={pendingAction}
  onApprove={handleApproveAction}
  onReject={handleRejectAction}
  onOther={handleOther}
  isProcessing={actionProcessing}
/>
```

- [ ] **Mettre à jour le handler `onMeta` pour gérer `navigate` et `tool_executing: null`**

Dans `sendMessage`, localiser le handler `onMeta` (le callback avec `meta`) et ajouter après les handlers existants :

```javascript
        if (meta.navigate) {
          navigate(meta.navigate)
          if (meta.section) {
            setTimeout(() => {
              document.getElementById(meta.section)?.scrollIntoView({ behavior: 'smooth' })
            }, 300)
          }
        }
        if ('tool_executing' in meta && meta.tool_executing === null) {
          setToolExecuting(null)
        }
```

Faire la même chose dans le handler `onMeta` de `handleApproveAction`. Localiser le second appel à `streamNeoChat` dans `handleApproveAction` et remplacer son `onMeta` par :

```javascript
        (meta) => {
          if (meta.credits_remaining !== undefined) setLocalCredits(meta.credits_remaining)
          if (meta.navigate) {
            navigate(meta.navigate)
            if (meta.section) {
              setTimeout(() => {
                document.getElementById(meta.section)?.scrollIntoView({ behavior: 'smooth' })
              }, 300)
            }
          }
          if ('tool_executing' in meta && meta.tool_executing === null) {
            setToolExecuting(null)
          }
        },
```

- [ ] **Vérifier que `useNavigate` est importé**

S'assurer que `useNavigate` est dans l'import React Router en haut du fichier :
```jsx
import { useLocation, useNavigate } from 'react-router-dom'
```
Et dans le composant :
```jsx
const navigate = useNavigate()
```

- [ ] **Commit combiné Tasks 7 + 8**

Ce commit inclut les changements de Task 7 (bouton "Autre" dans ActionApprovalCard) ET Task 8 (handleOther, navigate handler, prop onOther passée) dans un seul commit atomique :

```bash
git add src/components/NeoChat.jsx
git commit -m "feat(neo): add 'Autre' button, handleOther(), navigate handler in onMeta"
```

---

## Task 9 — Déploiement et vérification

- [ ] **Déployer l'Edge Function**

```bash
cd "c:/Users/Noakim Grelier/Desktop/NeoFlow Agnecy/NeoFlow BOS/Neoflow_BOS"
npx supabase functions deploy neo-chat --no-verify-jwt
```

Résultat attendu : `Deployed neo-chat`

- [ ] **Tester les outils lecture**

Ouvrir Neo dans l'app, taper :
- "Montre-moi les détails de ma dernière commande" → doit appeler `get_order_details`
- "C'est quoi le niveau de stock ?" → doit appeler `get_stock_levels`
- "Résumé financier de ce mois" → doit appeler `get_financial_summary`
- "Amène-moi dans les paramètres" → doit naviguer vers `/settings`
- "Va dans l'abonnement" → doit naviguer vers `/settings` + scroller vers `subscription`

- [ ] **Tester les outils écriture**

Taper :
- "Crée un client Jean Dupont, téléphone 0612345678" → carte d'approbation `create_customer`
- Cliquer "Approuver" → `✅ Client Jean Dupont créé`
- Cliquer "Autre" → textarea s'affiche → taper "Le nom c'est Martin pas Dupont" → cliquer Envoyer → Neo reprend

- [ ] **Tester tool_executing clear**

Poser une question qui déclenche un outil lecture (ex: "cherche les commandes") → l'indicateur d'outil doit s'afficher pendant l'exécution et disparaître dès que la réponse arrive.

- [ ] **Push final**

```bash
git push origin main
```
