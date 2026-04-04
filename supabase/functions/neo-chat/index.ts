import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'

// ── Utilitaires ───────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function safe(p: Promise<{ data: unknown; error: unknown }>): Promise<any[] | null> {
  try {
    const { data, error } = await p
    return (!error && Array.isArray(data) && data.length > 0) ? data as any[] : null
  } catch { return null }
}

// ── Données workspace ─────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function fetchWorkspaceData(supabase: any, workspaceId: string) {
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [commandes, factures, factures_payees, devis, livraisons, clients, produits, payments] =
    await Promise.all([
      safe(supabase.from('orders').select('order_number,status,total_ttc,remaining_amount,customers(first_name,last_name)').eq('workspace_id', workspaceId).not('status','in','(termine,annule)').order('created_at',{ascending:false}).limit(8)),
      safe(supabase.from('invoices').select('invoice_number,status,total_ttc,issue_date,customers(first_name,last_name)').eq('workspace_id', workspaceId).order('created_at',{ascending:false}).limit(6)),
      safe(supabase.from('invoices').select('total_ttc').eq('workspace_id', workspaceId).in('status',['payee','payée','paid']).gte('issue_date', firstOfMonth)),
      safe(supabase.from('quotes').select('quote_number,status,total_ttc,customers(first_name,last_name)').eq('workspace_id', workspaceId).not('status','in','(accepted,rejected,expired)').order('created_at',{ascending:false}).limit(5)),
      safe(supabase.from('deliveries').select('delivery_date,status,time_slot,customers(first_name,last_name)').eq('workspace_id', workspaceId).not('status','in','(livree,annulee)').order('delivery_date',{ascending:true}).limit(6)),
      safe(supabase.from('customers').select('first_name,last_name,phone,city').eq('workspace_id', workspaceId).order('created_at',{ascending:false}).limit(10)),
      safe(supabase.from('products').select('name,price,category').eq('workspace_id', workspaceId).order('name',{ascending:true}).limit(20)),
      safe(supabase.from('payments').select('amount').eq('workspace_id', workspaceId).gte('payment_date', firstOfMonth)),
    ])

  // deno-lint-ignore no-explicit-any
  const sum = (arr: any[] | null, k: string) => (arr ?? []).reduce((s: number, r: any) => s + (r[k] || 0), 0)
  const ca_factures = sum(factures_payees, 'total_ttc')
  const ca_payments = sum(payments, 'amount')
  const ca_mois = ca_payments > 0 ? ca_payments : ca_factures
  // deno-lint-ignore no-explicit-any
  const soldes = (commandes ?? []).reduce((s: number, c: any) => s + (c.remaining_amount || 0), 0)

  return {
    commandes:  commandes  ?? [],
    factures:   factures   ?? [],
    devis:      devis      ?? [],
    livraisons: livraisons ?? [],
    clients:    clients    ?? [],
    produits:   produits   ?? [],
    kpis: {
      ca_mois:              Math.round(ca_mois * 100) / 100,
      soldes_en_attente:    Math.round(soldes * 100) / 100,
      commandes_actives:    (commandes ?? []).length,
      devis_ouverts:        (devis ?? []).length,
      livraisons_prevues:   (livraisons ?? []).length,
      produits_catalogue:   (produits ?? []).length,
    },
  }
}

// ── Construction du prompt ────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function buildSystemPrompt(context: any, wd: any, isPro: boolean): string {
  const pageLabels: Record<string, string> = {
    '/dashboard': 'Tableau de bord', '/vente-rapide': 'Vente rapide (POS)',
    '/commandes': 'Commandes', '/commandes/nouvelle': 'Nouvelle commande',
    '/factures': 'Factures', '/devis': 'Devis', '/clients': 'Clients',
    '/produits': 'Produits', '/stock': 'Stock', '/livraisons': 'Livraisons',
    '/fournisseurs': 'Fournisseurs', '/statistiques': 'Statistiques',
    '/settings': 'Paramètres', '/documentation': 'Documentation',
  }
  const roleLabels: Record<string, string> = {
    proprietaire: 'Propriétaire', owner: 'Propriétaire',
    manager: 'Manager', admin: 'Manager',
    vendeur: 'Vendeur', member: 'Vendeur',
    livreur: 'Livreur',
  }

  const page = pageLabels[context?.page] || context?.page || 'Application'
  const role = roleLabels[context?.role] || context?.role || 'Utilisateur'
  const shop = context?.workspace_name || 'le magasin'
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // deno-lint-ignore no-explicit-any
  const fmt = (arr: any[], label: string, fn: (x: any) => string) => {
    if (!Array.isArray(arr) || arr.length === 0) return `${label} : (aucun)`
    return `${label} :\n` + arr.map((x, i) => `  ${i+1}. ${fn(x)}`).join('\n')
  }

  const k = wd?.kpis || {}
  // deno-lint-ignore no-explicit-any
  const cname = (c: any) => [c?.first_name, c?.last_name].filter(Boolean).join(' ') || 'Client inconnu'

  // deno-lint-ignore no-explicit-any
  const commandesBlock = fmt(wd?.commandes || [], 'Commandes en cours', (c: any) =>
    `${c.order_number} — ${cname(c.customers)} — ${c.status} — ${c.total_ttc}€${c.remaining_amount>0?' (reste: '+c.remaining_amount+'€)':''}`)
  // deno-lint-ignore no-explicit-any
  const facturesBlock = fmt(wd?.factures || [], 'Factures récentes', (f: any) =>
    `${f.invoice_number} — ${cname(f.customers)} — ${f.status} — ${f.total_ttc}€`)
  // deno-lint-ignore no-explicit-any
  const devisBlock = fmt(wd?.devis || [], 'Devis en attente', (d: any) =>
    `${d.quote_number} — ${cname(d.customers)} — ${d.status} — ${d.total_ttc}€`)
  // deno-lint-ignore no-explicit-any
  const livraisonsBlock = fmt(wd?.livraisons || [], 'Livraisons à venir', (l: any) =>
    `${cname(l.customers)} — ${l.delivery_date}${l.time_slot?' '+l.time_slot:''} — ${l.status}`)
  // deno-lint-ignore no-explicit-any
  const clientsBlock = fmt(wd?.clients || [], 'Clients récents', (c: any) =>
    `${cname(c)}${c.city?' ('+c.city+')':''}${c.phone?' — '+c.phone:''}`)
  // deno-lint-ignore no-explicit-any
  const produitsBlock = fmt(wd?.produits || [], 'Produits du catalogue', (p: any) =>
    `${p.name}${p.category?' ['+p.category+']':''} — ${p.price}€`)

  const toolsBlock = isPro ? `
## Outils disponibles (UTILISE-LES pour répondre avec des données précises)

**Lecture (appel direct, pas besoin d'approbation) :**
- \`search_orders\` — chercher des commandes par numéro, statut, ou nom client
- \`get_customer_info\` — fiche complète d'un client (coordonnées, historique)
- \`get_stock_alerts\` — produits en rupture ou stock faible
- \`search_products\` — rechercher des produits dans le catalogue

**Écriture (TOUJOURS demander approbation avant) :**
- \`update_order_status\` — modifier le statut d'une commande
- \`create_delivery\` — planifier une livraison

## Règles d'utilisation des outils

1. **Pour toute question sur les commandes/clients/produits/stock** : utilise d'abord l'outil de lecture correspondant pour obtenir les données actuelles — ne te base pas uniquement sur le contexte ci-dessous qui peut être incomplet.
2. **Pour annuler N commandes** : appelle d'abord \`search_orders\` pour trouver les N dernières, puis appelle \`update_order_status\` une fois PAR commande (chaque appel déclenche une carte d'approbation séparée). Ne décris pas ce que tu vas faire — appelle directement l'outil.
3. **Pour les modifications** : NE DIS PAS "je vais faire X" et attends — appelle l'outil immédiatement, le système d'approbation s'occupera de demander confirmation à l'utilisateur.
4. **Si le résultat d'un outil est vide** : dis-le clairement sans inventer.` : `
## Mode basique
Tu n'as pas accès aux outils de recherche en temps réel. Utilise uniquement les données ci-dessous pour répondre.`

  return `Tu es **Neo**, l'assistant IA de **${shop}** (logiciel NeoFlow BOS — gestion de magasin).
Date : ${today} | Page active : ${page} | Rôle de l'utilisateur : ${role}

## Ta personnalité
- Direct, précis, utile. Réponses courtes sauf si question complexe.
- Toujours en français.
- Tu connais NeoFlow BOS par cœur : tu guides l'utilisateur dans l'interface, tu réponds sur ses données réelles.
- Quand tu ne sais pas ou que la donnée n'est pas disponible, tu le dis clairement sans inventer.
${toolsBlock}

## Données actuelles du workspace (snapshot au chargement)

**KPIs du mois :**
- CA encaissé : ${k.ca_mois ? k.ca_mois + ' €' : 'N/A'}
- Soldes à encaisser : ${k.soldes_en_attente ? k.soldes_en_attente + ' €' : '0 €'}
- Commandes actives : ${k.commandes_actives ?? 0}
- Devis ouverts : ${k.devis_ouverts ?? 0}
- Livraisons prévues : ${k.livraisons_prevues ?? 0}
- Produits au catalogue : ${k.produits_catalogue ?? 0}

${commandesBlock}

${produitsBlock}

${devisBlock}

${livraisonsBlock}

${clientsBlock}

${facturesBlock}

> Ces données sont un snapshot. Pour des données à jour ou des recherches précises, utilise les outils.`
}

// ── Définition des outils (OpenAI function calling format) ────────────────────

const NEO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_orders',
      description: 'Rechercher des commandes dans le workspace. Utilise ce tool pour trouver des commandes spécifiques par numéro, statut ou nom de client.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Numéro de commande ou nom du client à rechercher' },
          status: { type: 'string', description: 'Filtrer par statut: brouillon, confirme, en_preparation, en_livraison, livre, termine, annule' },
          limit: { type: 'number', description: 'Nombre maximum de résultats (défaut: 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_info',
      description: 'Obtenir les informations détaillées d\'un client : coordonnées, historique commandes, total CA.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Nom, prénom ou téléphone du client à rechercher' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_alerts',
      description: 'Obtenir les alertes de stock : produits en rupture ou en quantité faible, par emplacement.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Rechercher des produits dans le catalogue (nom, catégorie, prix).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Terme de recherche (nom ou catégorie du produit)' },
          max_price: { type: 'number', description: 'Prix maximum (optionnel)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_order_status',
      description: 'Modifier le statut d\'une commande. Requiert approbation utilisateur. Pour annuler utilise plutôt cancel_order.',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Numéro exact de la commande (ex: CMD-2026-042)' },
          new_status: { type: 'string', description: 'Nouveau statut: confirme, en_preparation, en_livraison, livre, termine, annule' },
          reason: { type: 'string', description: 'Raison du changement' },
        },
        required: ['order_number', 'new_status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_order',
      description: 'Annuler une commande. Requiert approbation utilisateur. Utilise cet outil quand l\'utilisateur demande d\'annuler une commande spécifique.',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Numéro exact de la commande à annuler (ex: CMD-2026-042)' },
          reason: { type: 'string', description: 'Raison de l\'annulation (optionnel)' },
        },
        required: ['order_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_delivery',
      description: 'Planifier une livraison pour une commande. Requiert approbation utilisateur.',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Numéro de commande' },
          delivery_date: { type: 'string', description: 'Date de livraison au format YYYY-MM-DD' },
          time_slot: { type: 'string', description: 'Créneau horaire (ex: "14h-17h")' },
          notes: { type: 'string', description: 'Notes pour le livreur (optionnel)' },
        },
        required: ['order_number', 'delivery_date'],
      },
    },
  },
]

// Outils qui nécessitent une approbation explicite de l'utilisateur
const APPROVAL_REQUIRED_TOOLS = new Set(['update_order_status', 'cancel_order', 'create_delivery'])

// ── Exécution des outils (lecture seule) ─────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function executeTool(supabase: any, workspaceId: string, toolName: string, toolArgs: any): Promise<string> {
  try {
    switch (toolName) {
      case 'search_orders': {
        let query = supabase
          .from('orders')
          .select('order_number,status,total_ttc,remaining_amount,created_at,customers(first_name,last_name,phone)')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(toolArgs.limit || 5)

        if (toolArgs.status) query = query.eq('status', toolArgs.status)
        if (toolArgs.query) {
          // Recherche par numéro de commande
          query = query.ilike('order_number', `%${toolArgs.query}%`)
        }

        const { data, error } = await query
        if (error) return `Erreur recherche commandes: ${error.message}`
        if (!data || data.length === 0) return 'Aucune commande trouvée avec ces critères.'

        // deno-lint-ignore no-explicit-any
        return data.map((o: any) => {
          const client = o.customers ? `${o.customers.first_name || ''} ${o.customers.last_name || ''}`.trim() : '?'
          return `${o.order_number} | ${client} | ${o.status} | ${o.total_ttc}€${o.remaining_amount > 0 ? ` (reste: ${o.remaining_amount}€)` : ''}`
        }).join('\n')
      }

      case 'get_customer_info': {
        const { data, error } = await supabase
          .from('customers')
          .select('first_name,last_name,phone,email,address,city,postal_code,is_priority,notes')
          .eq('workspace_id', workspaceId)
          .or(`first_name.ilike.%${toolArgs.query}%,last_name.ilike.%${toolArgs.query}%,phone.ilike.%${toolArgs.query}%`)
          .limit(3)

        if (error) return `Erreur recherche client: ${error.message}`
        if (!data || data.length === 0) return `Aucun client trouvé pour "${toolArgs.query}".`

        // deno-lint-ignore no-explicit-any
        return data.map((c: any) => {
          const lines = [`${c.first_name || ''} ${c.last_name || ''}`.trim()]
          if (c.phone) lines.push(`Tél: ${c.phone}`)
          if (c.email) lines.push(`Email: ${c.email}`)
          if (c.city) lines.push(`Ville: ${c.city}${c.postal_code ? ' '+c.postal_code : ''}`)
          if (c.is_priority) lines.push('⭐ Client prioritaire')
          if (c.notes) lines.push(`Note: ${c.notes}`)
          return lines.join(' | ')
        }).join('\n---\n')
      }

      case 'get_stock_alerts': {
        const { data, error } = await supabase
          .from('stock_levels')
          .select('quantity_available,min_quantity,products(name,category),stock_locations(name)')
          .eq('workspace_id', workspaceId)

        if (error) return `Erreur lecture stock: ${error.message}`
        if (!data || data.length === 0) return 'Aucune donnée de stock disponible.'

        // deno-lint-ignore no-explicit-any
        const alerts = data.filter((s: any) => s.quantity_available <= (s.min_quantity || 3))
        if (alerts.length === 0) return 'Aucune alerte de stock. Tous les produits sont en quantité suffisante.'

        // deno-lint-ignore no-explicit-any
        return alerts.map((s: any) => {
          const productName = s.products?.name || '?'
          const location = s.stock_locations?.name || 'Stock principal'
          const qty = s.quantity_available
          const min = s.min_quantity || 3
          const severity = qty === 0 ? '🔴 RUPTURE' : '🟡 Faible'
          return `${severity} | ${productName} | ${location} | ${qty}/${min} unités`
        }).join('\n')
      }

      case 'search_products': {
        let query = supabase
          .from('products')
          .select('name,price,category,description')
          .eq('workspace_id', workspaceId)
          .eq('is_archived', false)
          .ilike('name', `%${toolArgs.query}%`)
          .limit(8)

        if (toolArgs.max_price) query = query.lte('price', toolArgs.max_price)

        const { data, error } = await query
        if (error) return `Erreur recherche produits: ${error.message}`
        if (!data || data.length === 0) {
          // Essayer par catégorie
          const { data: byCat } = await supabase
            .from('products')
            .select('name,price,category')
            .eq('workspace_id', workspaceId)
            .eq('is_archived', false)
            .ilike('category', `%${toolArgs.query}%`)
            .limit(8)
          if (!byCat || byCat.length === 0) return `Aucun produit trouvé pour "${toolArgs.query}".`
          // deno-lint-ignore no-explicit-any
          return byCat.map((p: any) => `${p.name} | ${p.price}€${p.category?' ['+p.category+']':''}`).join('\n')
        }

        // deno-lint-ignore no-explicit-any
        return data.map((p: any) => `${p.name} | ${p.price}€${p.category?' ['+p.category+']':''}`).join('\n')
      }

      default:
        return `Outil "${toolName}" non reconnu.`
    }
  } catch (e) {
    return `Erreur exécution outil: ${String(e)}`
  }
}

// Note: l'exécution des actions approuvées est faite directement dans executeApprovedActionInline()
// appelé depuis le handler principal lorsque approved_action_id est présent dans la requête.

// deno-lint-ignore no-explicit-any
async function executeApprovedActionInline(supabase: any, workspaceId: string, toolName: string, toolArgs: any): Promise<string> {
  try {
    switch (toolName) {
      case 'update_order_status': {
        const { data: orders } = await supabase
          .from('orders').select('id,order_number,status')
          .eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const order = orders[0]
        const { error } = await supabase.from('orders')
          .update({ status: toolArgs.new_status, updated_at: new Date().toISOString() }).eq('id', order.id)
        if (error) return `Erreur mise à jour: ${error.message}`
        return `✅ Commande ${order.order_number} passée en statut "${toolArgs.new_status}".`
      }
      case 'cancel_order': {
        const { data: orders } = await supabase
          .from('orders').select('id,order_number,status')
          .eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const order = orders[0]
        if (order.status === 'annule') return `La commande ${order.order_number} est déjà annulée.`
        const { error } = await supabase.from('orders')
          .update({ status: 'annule', updated_at: new Date().toISOString() }).eq('id', order.id)
        if (error) return `Erreur annulation: ${error.message}`
        return `✅ Commande ${order.order_number} annulée.`
      }
      case 'create_delivery': {
        const { data: orders } = await supabase
          .from('orders').select('id,order_number,customer_id')
          .eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const order = orders[0]
        const { error } = await supabase.from('deliveries').insert({
          workspace_id: workspaceId, order_id: order.id, customer_id: order.customer_id,
          delivery_date: toolArgs.delivery_date, time_slot: toolArgs.time_slot || null,
          notes: toolArgs.notes || null, status: 'planifiee',
        })
        if (error) return `Erreur création livraison: ${error.message}`
        return `✅ Livraison planifiée pour ${order.order_number} le ${toolArgs.delivery_date}${toolArgs.time_slot ? ' ('+toolArgs.time_slot+')' : ''}.`
      }
      default:
        return `Action "${toolName}" non reconnue.`
    }
  } catch (e) {
    return `Erreur exécution action: ${String(e)}`
  }
}

// ── Description lisible d'une action pour l'UI d'approbation ─────────────────

// deno-lint-ignore no-explicit-any
function getActionLabel(toolName: string, toolArgs: any): { label: string; details: string } {
  switch (toolName) {
    case 'update_order_status':
      return {
        label: `Passer la commande ${toolArgs.order_number} en "${toolArgs.new_status}"`,
        details: toolArgs.reason || `Modification du statut de ${toolArgs.order_number}`,
      }
    case 'cancel_order':
      return {
        label: `Annuler la commande ${toolArgs.order_number}`,
        details: toolArgs.reason || 'Annulation demandée par l\'utilisateur',
      }
    case 'create_delivery':
      return {
        label: `Planifier une livraison pour ${toolArgs.order_number} le ${toolArgs.delivery_date}`,
        details: `${toolArgs.time_slot ? 'Créneau: '+toolArgs.time_slot+'. ' : ''}${toolArgs.notes || ''}`,
      }
    default:
      return { label: toolName, details: JSON.stringify(toolArgs) }
  }
}

// ── Résolution du plan ────────────────────────────────────────────────────────

function resolvePlan(planType: string | null | undefined): string {
  if (planType === 'standard') return 'pro'
  if (['basic', 'pro', 'enterprise', 'early-access'].includes(planType ?? '')) return planType!
  return 'basic'
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifié')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifié')

    const body = await req.json()
    const {
      message,
      context,
      history: rawHistory,
      // Pour la résolution d'une action approuvée
      approved_action_id,
      approved_action_result,
    } = body

    if (!message?.trim() && !approved_action_id) throw new Error('Message vide')
    if (message && message.length > 4000) throw new Error('Message trop long (max 4000 caractères)')

    const history = Array.isArray(rawHistory)
      ? rawHistory
          .filter((m: unknown) => {
            if (typeof m !== 'object' || m === null) return false
            const msg = m as Record<string, unknown>
            return msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool'
          })
          .map((m: unknown) => {
            const msg = m as Record<string, unknown>
            return {
              role: msg.role,
              content: String(msg.content ?? '').slice(0, 2000),
              ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
              ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
              ...(msg.name ? { name: msg.name } : {}),
            }
          })
      : []

    // Résoudre workspace_id
    let workspaceId = context?.workspace_id as string | undefined
    if (!workspaceId) {
      const { data: wsUser } = await supabase
        .from('workspace_users').select('workspace_id')
        .eq('user_id', user.id).limit(1).single()
      workspaceId = wsUser?.workspace_id
    }

    if (!workspaceId) throw new Error('Workspace introuvable')

    // ── Vérifier plan et crédits ──────────────────────────────────────────────

    const { data: ws } = await supabase
      .from('workspaces')
      .select('plan_type')
      .eq('id', workspaceId)
      .single()

    const plan = resolvePlan(ws?.plan_type)
    const isPro = plan === 'pro' || plan === 'enterprise' || plan === 'early-access'

    const { data: creditsRow } = await supabase
      .from('neo_credits')
      .select('credits_balance, monthly_allowance')
      .eq('workspace_id', workspaceId)
      .single()

    const isUnlimited = creditsRow?.monthly_allowance === -1
    const creditsBalance: number = creditsRow?.credits_balance ?? 0

    if (!isUnlimited && creditsBalance <= 0) {
      throw new Error('Tokens épuisés. Attendez le renouvellement mensuel ou achetez des tokens supplémentaires dans Paramètres → Abonnement.')
    }

    // ── Récupérer les données workspace ───────────────────────────────────────

    const wd = await fetchWorkspaceData(supabase, workspaceId)
    const systemPrompt = buildSystemPrompt(context, wd, isPro)

    // ── Routage : OpenRouter pour tous les plans (si clé dispo), Ollama en fallback ──

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY')
    const useOpenRouter = !!openRouterKey

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    let tokensUsed = 0

    if (useOpenRouter) {
      // ── OpenRouter avec function calling ─────────────────────────────────────

      // Basic → modèle rapide et économique. Pro/Enterprise → modèle plus capable.
      const openRouterModel = isPro
        ? (Deno.env.get('OPENROUTER_MODEL') || 'openai/gpt-4o-mini')
        : (Deno.env.get('OPENROUTER_MODEL_BASIC') || 'google/gemini-flash-1.5')

      // Construire les messages pour OpenRouter
      const messages: unknown[] = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-10),
      ]

      // Si on reprend après une action approuvée : exécuter l'action et streamer le résultat
      if (approved_action_id && approved_action_result === 'approved') {
        const { data: pendingAction } = await supabase
          .from('neo_pending_actions')
          .select('tool_name, tool_args')
          .eq('id', approved_action_id)
          .single()

        if (pendingAction) {
          const actionResult = await executeApprovedActionInline(
            supabase, workspaceId!, pendingAction.tool_name, pendingAction.tool_args
          )
          // Marquer l'action comme exécutée
          await supabase.from('neo_pending_actions')
            .update({ status: 'executed', executed_at: new Date().toISOString() })
            .eq('id', approved_action_id)

          // Relancer OpenRouter avec le résultat de l'outil pour obtenir un résumé naturel
          messages.push({ role: 'user', content: message || `[Action exécutée]` })
          messages.push({
            role: 'assistant', content: null,
            tool_calls: [{ id: 'approved_action', type: 'function', function: { name: pendingAction.tool_name, arguments: JSON.stringify(pendingAction.tool_args) } }],
          })
          messages.push({
            role: 'tool', tool_call_id: 'approved_action',
            name: pendingAction.tool_name, content: actionResult,
          })
        } else {
          messages.push({ role: 'user', content: message })
        }
      } else {
        messages.push({ role: 'user', content: message })
      }

      const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'https://neoflow.fr',
          'X-Title': 'NeoFlow BOS',
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages,
          tools: NEO_TOOLS,
          tool_choice: 'auto',
          stream: true,
          max_tokens: 800,
          temperature: 0.1,
          stream_options: { include_usage: true },
        }),
      })

      if (!orRes.ok) {
        const err = await orRes.text()
        throw new Error(`OpenRouter error ${orRes.status}: ${err}`)
      }

      ;(async () => {
        const reader = orRes.body!.getReader()
        let buf = ''
        let currentToolCallId = ''
        let currentToolName = ''
        let currentToolArgs = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              if (trimmed === 'data: [DONE]') {
                // Si on a accumulé un appel d'outil, le traiter maintenant
                if (currentToolCallId && currentToolName) {
                  let parsedArgs: Record<string, unknown> = {}
                  try { parsedArgs = JSON.parse(currentToolArgs) } catch { /* ignore */ }

                  if (APPROVAL_REQUIRED_TOOLS.has(currentToolName)) {
                    // Action qui nécessite approbation : créer un pending_action en DB et notifier le frontend
                    const { label, details } = getActionLabel(currentToolName, parsedArgs)

                    const { data: pendingAction } = await supabase
                      .from('neo_pending_actions')
                      .insert({
                        workspace_id: workspaceId,
                        user_id: user.id,
                        tool_name: currentToolName,
                        tool_args: parsedArgs,
                        action_label: label,
                        action_details: details,
                        status: 'pending',
                      })
                      .select('id')
                      .single()

                    // Envoyer l'événement d'approbation au frontend
                    await writer.write(encoder.encode(`data: ${JSON.stringify({
                      pending_action: {
                        id: pendingAction?.id,
                        tool_name: currentToolName,
                        tool_args: parsedArgs,
                        label,
                        details,
                      }
                    })}\n\n`))
                  } else {
                    // Outil lecture seule : exécuter directement
                    const toolResult = await executeTool(supabase, workspaceId!, currentToolName, parsedArgs)

                    // Notifier le frontend que l'outil tourne
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ tool_executing: currentToolName })}\n\n`))

                    // Relancer l'inférence avec le résultat de l'outil (non-streaming pour simplifier)
                    const resumeMessages = [
                      ...messages,
                      {
                        role: 'assistant',
                        content: null,
                        tool_calls: [{
                          id: currentToolCallId,
                          type: 'function',
                          function: { name: currentToolName, arguments: currentToolArgs },
                        }],
                      },
                      {
                        role: 'tool',
                        tool_call_id: currentToolCallId,
                        name: currentToolName,
                        content: toolResult,
                      },
                    ]

                    const resumeRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openRouterKey}`,
                        'HTTP-Referer': 'https://neoflow.fr',
                        'X-Title': 'NeoFlow BOS',
                      },
                      body: JSON.stringify({
                        model: openRouterModel,
                        messages: resumeMessages,
                        stream: false,
                        max_tokens: 600,
                        temperature: 0.1,
                      }),
                    })

                    if (resumeRes.ok) {
                      const resumeData = await resumeRes.json()
                      const resumeContent = resumeData.choices?.[0]?.message?.content || ''
                      if (resumeData.usage?.total_tokens) tokensUsed += resumeData.usage.total_tokens

                      // Streamer la réponse finale mot par mot pour l'effet visuel
                      const words = resumeContent.split(' ')
                      for (const word of words) {
                        await writer.write(encoder.encode(`data: ${JSON.stringify({ t: word + ' ' })}\n\n`))
                      }
                    }
                  }

                  currentToolCallId = ''
                  currentToolName = ''
                  currentToolArgs = ''
                }

                // Déduire les crédits
                if (!isUnlimited && workspaceId && tokensUsed > 0) {
                  await supabase.rpc('deduct_neo_credits', {
                    p_workspace_id: workspaceId,
                    p_tokens_used: tokensUsed,
                  })
                  const creditsToDeduct = Math.max(1, Math.ceil(tokensUsed / 1000))
                  const newBalance = Math.max(0, creditsBalance - creditsToDeduct)
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ credits_remaining: newBalance, tokens_used: tokensUsed })}\n\n`))
                }

                await writer.write(encoder.encode('data: [DONE]\n\n'))
                continue
              }
              if (!trimmed.startsWith('data: ')) continue

              try {
                const json = JSON.parse(trimmed.slice(6))

                // Token de texte normal
                const tok = json?.choices?.[0]?.delta?.content
                if (tok) {
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ t: tok })}\n\n`))
                }

                // Appel d'outil en cours d'accumulation (streaming)
                const toolCallDelta = json?.choices?.[0]?.delta?.tool_calls?.[0]
                if (toolCallDelta) {
                  if (toolCallDelta.id) currentToolCallId = toolCallDelta.id
                  if (toolCallDelta.function?.name) currentToolName = toolCallDelta.function.name
                  if (toolCallDelta.function?.arguments) currentToolArgs += toolCallDelta.function.arguments
                }

                // Usage (dernier chunk)
                if (json?.usage?.total_tokens) {
                  tokensUsed = json.usage.total_tokens
                }
              } catch { /* skip invalid JSON */ }
            }
          }
        } catch { /* stream ended */ } finally {
          try { await writer.write(encoder.encode('data: [DONE]\n\n')) } catch { /* ignore */ }
          writer.close()
        }
      })()

    } else {
      // ── Ollama (Basic / fallback) — chat simple sans function calling ─────────

      const ollamaUrl = Deno.env.get('OLLAMA_URL') || 'http://172.17.0.1:11434'
      const ollamaModel = Deno.env.get('OLLAMA_MODEL') || 'qwen2.5:1.5b'

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.slice(-6),
        { role: 'user', content: message },
      ]

      const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages,
          stream: true,
          options: {
            temperature: 0.2,
            num_predict: 500,
            stop: ['<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|endoftext|>'],
          },
        }),
      })

      if (!ollamaRes.ok) {
        const err = await ollamaRes.text()
        const isMemoryError = err.includes('system memory') || err.includes('requires more')
        throw new Error(isMemoryError
          ? "Neo IA est temporairement indisponible (ressources insuffisantes). Réessayez dans quelques instants."
          : `Ollama error ${ollamaRes.status}: ${err}`)
      }

      ;(async () => {
        const reader = ollamaRes.body!.getReader()
        let ollamaBuf = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            ollamaBuf += decoder.decode(value, { stream: true })
            const lines = ollamaBuf.split('\n')
            ollamaBuf = lines.pop() ?? ''
            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed) continue
              try {
                const json = JSON.parse(trimmed)
                const tok = json?.message?.content
                if (tok) {
                  await writer.write(encoder.encode(`data: ${JSON.stringify({ t: tok })}\n\n`))
                }
                if (json?.done === true) {
                  tokensUsed = (json.eval_count ?? 0) + (json.prompt_eval_count ?? 0)
                  if (!isUnlimited && workspaceId && tokensUsed > 0) {
                    const creditsToDeduct = Math.max(1, Math.ceil(tokensUsed / 1000))
                    await supabase.rpc('deduct_neo_credits', { p_workspace_id: workspaceId, p_tokens_used: tokensUsed })
                    const newBalance = Math.max(0, creditsBalance - creditsToDeduct)
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ credits_remaining: newBalance, tokens_used: tokensUsed })}\n\n`))
                  }
                  await writer.write(encoder.encode('data: [DONE]\n\n'))
                }
              } catch { /* skip invalid JSON */ }
            }
          }
        } catch { /* stream ended */ } finally {
          try { await writer.write(encoder.encode('data: [DONE]\n\n')) } catch { /* ignore */ }
          writer.close()
        }
      })()
    }

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[neo-chat] Error:', msg)
    return new Response(
      `data: ${JSON.stringify({ error: msg })}\n\ndata: [DONE]\n\n`,
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      }
    )
  }
})
