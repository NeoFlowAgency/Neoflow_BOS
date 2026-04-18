import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['https://bos.neoflow-agency.cloud', 'http://localhost:5173', 'http://localhost:3000']
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
}

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

  const [commandes, factures, factures_payees, devis, livraisons, clients, produits, payments, contremarques] =
    await Promise.all([
      safe(supabase.from('orders').select('order_number,status,total_ttc,remaining_amount,customers(first_name,last_name)').eq('workspace_id', workspaceId).not('status','in','(termine,annule)').order('created_at',{ascending:false}).limit(8)),
      safe(supabase.from('invoices').select('invoice_number,status,total_ttc,issue_date,customers(first_name,last_name)').eq('workspace_id', workspaceId).order('created_at',{ascending:false}).limit(6)),
      safe(supabase.from('invoices').select('total_ttc').eq('workspace_id', workspaceId).in('status',['payee','payée','paid']).gte('issue_date', firstOfMonth)),
      safe(supabase.from('quotes').select('quote_number,status,total_ttc,customers(first_name,last_name)').eq('workspace_id', workspaceId).not('status','in','(accepted,rejected,expired)').order('created_at',{ascending:false}).limit(5)),
      safe(supabase.from('deliveries').select('delivery_date,status,time_slot,customers(first_name,last_name)').eq('workspace_id', workspaceId).not('status','in','(livree,annulee)').order('delivery_date',{ascending:true}).limit(6)),
      safe(supabase.from('customers').select('first_name,last_name,phone,city').eq('workspace_id', workspaceId).order('created_at',{ascending:false}).limit(10)),
      safe(supabase.from('products').select('name,unit_price_ht,category').eq('workspace_id', workspaceId).order('name',{ascending:true}).limit(20)),
      safe(supabase.from('payments').select('amount').eq('workspace_id', workspaceId).gte('payment_date', firstOfMonth)),
      safe(supabase.from('contremarques').select('id,status,notes,orders(order_number,customers(first_name,last_name))').eq('workspace_id', workspaceId).in('status',['en_attente','commandee']).order('created_at',{ascending:false}).limit(8)),
    ])

  // deno-lint-ignore no-explicit-any
  const sum = (arr: any[] | null, k: string) => (arr ?? []).reduce((s: number, r: any) => s + (r[k] || 0), 0)
  const ca_factures = sum(factures_payees, 'total_ttc')
  const ca_payments = sum(payments, 'amount')
  const ca_mois = ca_payments > 0 ? ca_payments : ca_factures
  // deno-lint-ignore no-explicit-any
  const soldes = (commandes ?? []).reduce((s: number, c: any) => s + (c.remaining_amount || 0), 0)

  return {
    commandes:     commandes     ?? [],
    factures:      factures      ?? [],
    devis:         devis         ?? [],
    livraisons:    livraisons    ?? [],
    clients:       clients       ?? [],
    produits:      produits      ?? [],
    contremarques: contremarques ?? [],
    kpis: {
      ca_mois:                  Math.round(ca_mois * 100) / 100,
      soldes_en_attente:        Math.round(soldes * 100) / 100,
      commandes_actives:        (commandes ?? []).length,
      devis_ouverts:            (devis ?? []).length,
      livraisons_prevues:       (livraisons ?? []).length,
      produits_catalogue:       (produits ?? []).length,
      contremarques_en_attente: (contremarques ?? []).length,
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
    `${p.name}${p.category?' ['+p.category+']':''} — ${p.unit_price_ht}€`)
  // deno-lint-ignore no-explicit-any
  const contremarquesBlock = fmt(wd?.contremarques || [], 'Contremarques en attente / commandées', (c: any) => {
    // deno-lint-ignore no-explicit-any
    const order = (c as any).orders
    const orderNum = order?.order_number || '?'
    const client = order?.customers ? `${order.customers.first_name||''} ${order.customers.last_name||''}`.trim() : 'Client inconnu'
    return `Commande ${orderNum} (${client}) — ${c.status}${c.notes?' — '+c.notes:''}`
  })

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
- \`list_contremarques\` — contremarques en attente / commandées
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
- Contremarques en attente/commandées : ${k.contremarques_en_attente ?? 0}

${commandesBlock}

${produitsBlock}

${devisBlock}

${livraisonsBlock}

${clientsBlock}

${facturesBlock}

${contremarquesBlock}

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
  // ── Nouveaux outils LECTURE ──
  { type:'function', function:{ name:'get_order_details', description:'Obtenir les détails complets d\'une commande : articles, paiements, livraison.', parameters:{ type:'object', properties:{ order_number:{ type:'string', description:'Numéro ou nom client' } } } } },
  { type:'function', function:{ name:'get_stock_levels', description:'Voir les niveaux de stock par produit et emplacement.', parameters:{ type:'object', properties:{ product_name:{ type:'string', description:'Nom du produit (optionnel)' } } } } },
  { type:'function', function:{ name:'search_invoices', description:'Chercher des factures par client, statut ou numéro.', parameters:{ type:'object', properties:{ query:{ type:'string' }, status:{ type:'string', description:'brouillon, emise, payee, annulee' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'search_quotes', description:'Chercher des devis ouverts ou par client.', parameters:{ type:'object', properties:{ query:{ type:'string' }, status:{ type:'string', description:'draft, sent, accepted, rejected, expired' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'search_deliveries', description:'Chercher des livraisons par statut ou date.', parameters:{ type:'object', properties:{ status:{ type:'string', description:'a_planifier, planifiee, en_cours, livree' }, date:{ type:'string', description:'YYYY-MM-DD — livraisons à partir de cette date' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'list_sav_tickets', description:'Lister les tickets SAV ouverts (ou par statut).', parameters:{ type:'object', properties:{ status:{ type:'string', description:'ouvert, en_cours, en_attente, resolu, ferme. Par défaut: tickets non résolus.' }, limit:{ type:'number' } } } } },
  { type:'function', function:{ name:'list_contremarques', description:'Lister les contremarques (produits commandés en attente de réception fournisseur). Filtre par statut possible.', parameters:{ type:'object', properties:{ status:{ type:'string', description:'en_attente, commandee, recue, annulee. Par défaut: en_attente et commandee.' }, limit:{ type:'number' } } } } },
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
]

// Outils qui nécessitent une approbation explicite de l'utilisateur
const APPROVAL_REQUIRED_TOOLS = new Set([
  'update_order_status', 'cancel_order', 'create_delivery',
  'create_order', 'create_customer', 'update_customer',
  'create_quote', 'update_quote_status', 'generate_invoice',
  'record_payment', 'create_sav_ticket', 'update_sav_status',
  'adjust_stock', 'update_delivery', 'create_product',
  'update_product', 'create_supplier', 'create_purchase_order',
])

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
          .select('quantity,reserved_quantity,products(name,category),stock_locations(name)')
          .eq('workspace_id', workspaceId)

        if (error) return `Erreur lecture stock: ${error.message}`
        if (!data || data.length === 0) return 'Aucune donnée de stock disponible.'

        const ALERT_THRESHOLD = 3
        // deno-lint-ignore no-explicit-any
        const alerts = data.filter((s: any) => {
          const avail = (s.quantity || 0) - (s.reserved_quantity || 0)
          return avail <= ALERT_THRESHOLD
        })
        if (alerts.length === 0) return 'Aucune alerte de stock. Tous les produits sont en quantité suffisante.'

        // deno-lint-ignore no-explicit-any
        return alerts.map((s: any) => {
          const productName = s.products?.name || '?'
          const location = s.stock_locations?.name || 'Stock principal'
          const avail = (s.quantity || 0) - (s.reserved_quantity || 0)
          const severity = avail <= 0 ? '🔴 RUPTURE' : '🟡 Faible'
          return `${severity} | ${productName} | ${location} | ${avail} dispo (total: ${s.quantity||0}, réservé: ${s.reserved_quantity||0})`
        }).join('\n')
      }

      case 'search_products': {
        let query = supabase
          .from('products')
          .select('name,unit_price_ht,category,description')
          .eq('workspace_id', workspaceId)
          .eq('is_archived', false)
          .ilike('name', `%${toolArgs.query}%`)
          .limit(8)

        if (toolArgs.max_price) query = query.lte('unit_price_ht', toolArgs.max_price)

        const { data, error } = await query
        if (error) return `Erreur recherche produits: ${error.message}`
        if (!data || data.length === 0) {
          // Essayer par catégorie
          const { data: byCat } = await supabase
            .from('products')
            .select('name,unit_price_ht,category')
            .eq('workspace_id', workspaceId)
            .eq('is_archived', false)
            .ilike('category', `%${toolArgs.query}%`)
            .limit(8)
          if (!byCat || byCat.length === 0) return `Aucun produit trouvé pour "${toolArgs.query}".`
          // deno-lint-ignore no-explicit-any
          return byCat.map((p: any) => `${p.name} | ${p.unit_price_ht}€${p.category?' ['+p.category+']':''}`).join('\n')
        }

        // deno-lint-ignore no-explicit-any
        return data.map((p: any) => `${p.name} | ${p.unit_price_ht}€${p.category?' ['+p.category+']':''}`).join('\n')
      }

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
        // deno-lint-ignore no-explicit-any
        const client = o.customers ? `${(o.customers as any).first_name||''} ${(o.customers as any).last_name||''}`.trim() : '?'
        const lines = [
          `Commande ${o.order_number} — ${client} — ${o.status}`,
          `Total: ${o.total_ttc}€ | Payé: ${o.amount_paid||0}€ | Reste: ${o.remaining_amount||0}€`,
          `Livraison: ${o.delivery_type || 'none'}`,
          // deno-lint-ignore no-explicit-any
          `Articles: ${(items||[]).map((i:any)=>`${i.description} x${i.quantity} @ ${i.unit_price_ht}€HT`).join(', ') || 'aucun'}`,
          // deno-lint-ignore no-explicit-any
          `Paiements: ${(payments||[]).map((p:any)=>`${p.amount}€ (${p.payment_method})`).join(', ') || 'aucun'}`,
        ]
        if (o.notes) lines.push(`Notes: ${o.notes}`)
        return lines.join('\n')
      }

      case 'get_stock_levels': {
        const query = toolArgs.product_name
        let q = supabase.from('stock_levels')
          .select('quantity,reserved_quantity,products(name,category),stock_locations(name)')
          .eq('workspace_id', workspaceId)
        if (query) q = q.ilike('products.name', `%${query}%`)
        const { data } = await q.limit(15)
        if (!data?.length) return 'Aucun niveau de stock trouvé.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map((s:any) => {
          const avail = (s.quantity||0) - (s.reserved_quantity||0)
          const alert = avail <= 3 ? (avail<=0?'🔴 RUPTURE':'🟡 Faible') : '🟢'
          return `${alert} ${s.products?.name||'?'} | ${s.stock_locations?.name||'Principal'} | Dispo: ${avail} (total: ${s.quantity||0}, réservé: ${s.reserved_quantity||0})`
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
        return (data as any[]).map((f:any) => {
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
        return (data as any[]).map((d:any) => {
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
        return (data as any[]).map((d:any) => {
          // deno-lint-ignore no-explicit-any
          const o = d.orders as any
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
        return (data as any[]).map((t:any) => {
          const c = t.customers ? `${t.customers.first_name||''} ${t.customers.last_name||''}`.trim() : '?'
          return `${t.ticket_number} | ${c} | ${t.status} | ${t.priority} | ${t.type} | ${t.orders?.order_number||'?'} | ${t.description?.slice(0,60)||''}`
        }).join('\n')
      }

      case 'list_contremarques': {
        let q = supabase.from('contremarques')
          .select('id,status,notes,created_at,orders(order_number,customers(first_name,last_name))')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(toolArgs.limit || 10)
        if (toolArgs.status) q = q.eq('status', toolArgs.status)
        else q = q.in('status', ['en_attente', 'commandee'])
        const { data } = await q
        if (!data?.length) return 'Aucune contremarque en attente.'
        // deno-lint-ignore no-explicit-any
        return (data as any[]).map((c:any) => {
          // deno-lint-ignore no-explicit-any
          const o = c.orders as any
          const client = o?.customers ? `${o.customers.first_name||''} ${o.customers.last_name||''}`.trim() : '?'
          return `Commande ${o?.order_number||'?'} | ${client} | ${c.status}${c.notes?' | '+c.notes:''}`
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
        return (data as any[]).map((s:any) => `${s.name}${s.contact_name?' — '+s.contact_name:''}${s.email?' | '+s.email:''}${s.phone?' | '+s.phone:''}`).join('\n')
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
        return (data as any[]).map((p:any) => `${p.po_number} | ${p.suppliers?.name||'?'} | ${p.status} | ${p.total_amount||0}€ | ${p.expected_date||'?'}`).join('\n')
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
        const items = toolArgs.items as Array<{ product_name: string; quantity: number; unit_price?: number }>
        const resolvedItems = []
        let subtotalHt = 0
        for (const item of items || []) {
          const { data: prods } = await supabase.from('products')
            .select('id,name,unit_price_ht,tax_rate').eq('workspace_id', workspaceId)
            .ilike('name', `%${item.product_name}%`).limit(1)
          // deno-lint-ignore no-explicit-any
          const prod = (prods as any[])?.[0]
          if (!prod) continue
          const price = item.unit_price ?? prod.unit_price_ht ?? 0
          const lineHt = price * item.quantity
          subtotalHt += lineHt
          resolvedItems.push({ product_id: prod.id, description: prod.name, quantity: item.quantity, unit_price_ht: price, tax_rate: prod.tax_rate || 20, total_ht: lineHt })
        }
        if (!resolvedItems.length) return 'Aucun produit trouvé dans le catalogue pour cette commande.'
        const totalTva = resolvedItems.reduce((s, i) => s + i.total_ht * (i.tax_rate / 100), 0)
        const totalTtc = subtotalHt + totalTva
        const nowStr = new Date().toISOString()
        const { data: order, error: oErr } = await supabase.from('orders').insert({
          workspace_id: workspaceId, customer_id: customerId,
          status: 'confirme', order_type: 'standard', source: 'neo',
          subtotal_ht: subtotalHt, total_tva: totalTva, total_ttc: totalTtc,
          amount_paid: 0, remaining_amount: totalTtc,
          delivery_type: toolArgs.delivery_type || 'none',
          requires_delivery: (toolArgs.delivery_type||'none') !== 'none',
          notes: toolArgs.notes || null, created_at: nowStr, updated_at: nowStr,
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
          // deno-lint-ignore no-explicit-any
          const prod = (prods as any[])?.[0]
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
        const nowStr = new Date().toISOString()
        const { data: quote, error: qErr } = await supabase.from('quotes').insert({
          workspace_id: workspaceId, customer_id: customerId, status: 'draft',
          subtotal_ht: subtotalHt, total_tva: totalTva, total_ttc: totalTtc,
          valid_until: validUntil, notes: toolArgs.notes || null,
          created_at: nowStr, updated_at: nowStr,
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
        const category = toolArgs.invoice_type || 'standard'
        const { data: orderFull } = await supabase.from('orders')
          .select('customer_id,subtotal_ht,total_tva,total_ttc,amount_paid,discount_global')
          .eq('id', order.id).single()
        if (!orderFull) return 'Impossible de récupérer les données de la commande.'
        const nowStr = new Date().toISOString()
        const { data: inv, error: invErr } = await supabase.from('invoices').insert({
          workspace_id: workspaceId, order_id: order.id,
          customer_id: orderFull.customer_id,
          status: category === 'deposit' ? 'brouillon' : 'emise',
          invoice_category: category,
          total_ttc: category === 'deposit' ? (orderFull.amount_paid || 0) : (orderFull.total_ttc || 0),
          total_tva: orderFull.total_tva || 0, subtotal_ht: orderFull.subtotal_ht || 0,
          discount_global: orderFull.discount_global || 0,
          issue_date: nowStr.split('T')[0], created_at: nowStr, updated_at: nowStr,
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
        const nowStr = new Date().toISOString()
        const { error } = await supabase.from('payments').insert({
          workspace_id: workspaceId, order_id: order.id,
          amount, payment_method: toolArgs.payment_method || 'cash',
          payment_date: nowStr.split('T')[0], notes: toolArgs.notes || null,
        })
        if (error) return `Erreur enregistrement paiement: ${error.message}`
        const newPaid = (order.amount_paid || 0) + amount
        const newRemaining = Math.max(0, (order.total_ttc || 0) - newPaid)
        const newStatus = newRemaining <= 0.01 ? 'termine' : order.status
        await supabase.from('orders').update({ amount_paid: newPaid, remaining_amount: newRemaining, status: newStatus, updated_at: nowStr }).eq('id', order.id)
        return `✅ Paiement de ${amount}€ (${toolArgs.payment_method||'espèces'}) enregistré sur ${order.order_number}.${newRemaining<=0.01?' Commande soldée !':` Reste: ${newRemaining.toFixed(2)}€`}`
      }

      case 'create_sav_ticket': {
        const { data: orders } = await supabase.from('orders').select('id,order_number,customer_id')
          .eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const order = orders[0]
        const nowStr = new Date().toISOString()
        const { data: ticket, error } = await supabase.from('sav_tickets').insert({
          workspace_id: workspaceId, order_id: order.id, customer_id: order.customer_id,
          type: toolArgs.type || 'reclamation', priority: toolArgs.priority || 'normale',
          status: 'ouvert', description: toolArgs.description || '',
          created_at: nowStr, updated_at: nowStr,
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
        let delivId: string | null = null
        const { data: orders } = await supabase.from('orders').select('id').eq('workspace_id', workspaceId).ilike('order_number', `%${toolArgs.order_number}%`).limit(1)
        if (!orders?.length) return `Commande "${toolArgs.order_number}" introuvable.`
        const { data: d } = await supabase.from('deliveries').select('id').eq('order_id', orders[0].id).neq('status','annulee').limit(1)
        delivId = d?.[0]?.id || null
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
        const nowStr = new Date().toISOString()
        const { data: prod, error } = await supabase.from('products').insert({
          workspace_id: workspaceId,
          name: toolArgs.name,
          unit_price_ht: parseFloat(toolArgs.unit_price_ht) || 0,
          tax_rate: parseFloat(toolArgs.tax_rate) || 20,
          category: toolArgs.category || null,
          description: toolArgs.description || null,
          is_archived: false, created_at: nowStr, updated_at: nowStr,
        }).select('id,name').single()
        if (error) return `Erreur création produit: ${error.message}`
        if (toolArgs.initial_stock && toolArgs.initial_stock > 0) {
          const { data: locs } = await supabase.from('stock_locations').select('id').eq('workspace_id', workspaceId).eq('is_default', true).limit(1)
          if (locs?.[0]) {
            await supabase.from('stock_levels').insert({ workspace_id: workspaceId, product_id: prod.id, location_id: locs[0].id, quantity: toolArgs.initial_stock, reserved_quantity: 0 })
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
        const { error } = await supabase.from('products').update(updates).eq('id', prod.id)
        if (error) return `Erreur: ${error.message}`
        return `✅ Produit "${prod.name}" mis à jour.`
      }

      case 'create_supplier': {
        const nowStr = new Date().toISOString()
        const { data: supplier, error } = await supabase.from('suppliers').insert({
          workspace_id: workspaceId,
          name: toolArgs.name,
          contact_name: toolArgs.contact_name || null,
          email: toolArgs.email || null,
          phone: toolArgs.phone || null,
          address: toolArgs.address || null,
          notes: toolArgs.notes || null,
          is_archived: false, created_at: nowStr, updated_at: nowStr,
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
          // deno-lint-ignore no-explicit-any
          const prod = (prods as any[])?.[0]
          if (!prod) continue
          const price = item.unit_price ?? prod.unit_price_ht ?? 0
          totalAmount += price * item.quantity
          resolvedItems.push({ product_id: prod.id, description: prod.name, quantity: item.quantity, unit_price: price, total: price * item.quantity })
        }
        if (!resolvedItems.length) return 'Aucun produit trouvé.'
        const nowStr = new Date().toISOString()
        const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
          workspace_id: workspaceId, supplier_id: supplier.id, status: 'brouillon',
          total_amount: totalAmount,
          expected_date: toolArgs.expected_date || null, notes: toolArgs.notes || null,
          created_at: nowStr, updated_at: nowStr,
        }).select('id,po_number').single()
        if (poErr) return `Erreur création bon de commande: ${poErr.message}`
        for (let i = 0; i < resolvedItems.length; i++) {
          await supabase.from('purchase_order_items').insert({ ...resolvedItems[i], purchase_order_id: po.id })
        }
        return `✅ Bon de commande ${po.po_number} créé pour ${supplier.name} — Total: ${totalAmount.toFixed(2)}€`
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
                    // Notifier le frontend que l'outil tourne (AVANT l'appel)
                    await writer.write(encoder.encode(`data: ${JSON.stringify({ tool_executing: currentToolName })}\n\n`))

                    // Outil lecture seule : exécuter directement
                    const toolResult = await executeTool(supabase, workspaceId!, currentToolName, parsedArgs)

                    // Cas spécial navigate_to : émettre un event SSE dédié
                    if (currentToolName === 'navigate_to') {
                      try {
                        const nav = JSON.parse(toolResult)
                        if (nav.__navigate) {
                          await writer.write(encoder.encode(`data: ${JSON.stringify({ __navigate: nav.__navigate, __section: nav.__section || null })}\n\n`))
                        }
                      } catch { /* toolResult est une erreur texte (route invalide), pas de navigation */ }
                    }

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

                      // Clear l'indicateur d'outil une fois la réponse streamée
                      await writer.write(encoder.encode(`data: ${JSON.stringify({ tool_executing: null })}\n\n`))
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
