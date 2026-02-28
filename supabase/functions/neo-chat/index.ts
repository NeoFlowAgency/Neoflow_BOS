import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const [commandes, factures, factures_payees, devis, livraisons, clients, produits, payments] =
    await Promise.all([
      safe(supabase.from('orders').select('order_number,status,total_ttc,amount_paid,remaining_amount,created_at,customers(name,phone)').eq('workspace_id', workspaceId).not('status','in','(termine,annule)').order('created_at',{ascending:false}).limit(20)),
      safe(supabase.from('invoices').select('invoice_number,status,total_ttc,issue_date,customers(name)').eq('workspace_id', workspaceId).order('created_at',{ascending:false}).limit(15)),
      safe(supabase.from('invoices').select('total_ttc').eq('workspace_id', workspaceId).in('status',['payee','payée','paid']).gte('issue_date', firstOfMonth)),
      safe(supabase.from('quotes').select('quote_number,status,total_ttc,issue_date,customers(name)').eq('workspace_id', workspaceId).not('status','in','(accepte,refuse,expire)').order('created_at',{ascending:false}).limit(10)),
      safe(supabase.from('deliveries').select('delivery_date,status,time_slot,customers(name,phone)').eq('workspace_id', workspaceId).not('status','in','(livree,annulee)').order('delivery_date',{ascending:true}).limit(10)),
      safe(supabase.from('customers').select('name,phone,city,is_priority').eq('workspace_id', workspaceId).order('created_at',{ascending:false}).limit(20)),
      safe(supabase.from('products').select('name,reference,price,cost_price_ht,category').eq('workspace_id', workspaceId).eq('is_archived',false).order('name',{ascending:true}).limit(60)),
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
function buildSystemPrompt(context: any, wd: any): string {
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

  // Formater les données
  // deno-lint-ignore no-explicit-any
  const fmt = (arr: any[], label: string, fn: (x: any) => string) => {
    if (!Array.isArray(arr) || arr.length === 0) return `${label} : aucun`
    return `${label} (${arr.length}) :\n` + arr.map(fn).join('\n')
  }

  const k = wd?.kpis || {}
  const kpiBlock = `KPIs du mois :
  CA encaissé     : ${k.ca_mois ? k.ca_mois + ' €' : 'inconnu'}
  Soldes à encaisser : ${k.soldes_en_attente ? k.soldes_en_attente + ' €' : '0 €'}
  Commandes actives  : ${k.commandes_actives ?? 0}
  Devis ouverts      : ${k.devis_ouverts ?? 0}
  Livraisons prévues : ${k.livraisons_prevues ?? 0}
  Catalogue produits : ${k.produits_catalogue ?? 0} produit(s)`

  // deno-lint-ignore no-explicit-any
  const commandesBlock = fmt(wd?.commandes || [], 'Commandes en cours', (c: any) =>
    `  • ${c.order_number || '?'} | ${c.customers?.name || 'Sans client'} | ${c.status} | ${c.total_ttc}€${c.remaining_amount > 0 ? ' (reste ' + c.remaining_amount + '€)' : ''}`)
  // deno-lint-ignore no-explicit-any
  const facturesBlock = fmt(wd?.factures || [], 'Factures récentes', (f: any) =>
    `  • ${f.invoice_number || '?'} | ${f.customers?.name || '?'} | ${f.status} | ${f.total_ttc}€ | ${f.issue_date || ''}`)
  // deno-lint-ignore no-explicit-any
  const devisBlock = fmt(wd?.devis || [], 'Devis ouverts', (d: any) =>
    `  • ${d.quote_number || '?'} | ${d.customers?.name || '?'} | ${d.status} | ${d.total_ttc}€ | ${d.issue_date || ''}`)
  // deno-lint-ignore no-explicit-any
  const livraisonsBlock = fmt(wd?.livraisons || [], 'Livraisons à venir', (l: any) =>
    `  • ${l.customers?.name || '?'} | ${l.delivery_date || '?'}${l.time_slot ? ' ' + l.time_slot : ''} | ${l.status}`)
  // deno-lint-ignore no-explicit-any
  const clientsBlock = fmt(wd?.clients || [], 'Clients récents', (c: any) =>
    `  • ${c.name}${c.city ? ' (' + c.city + ')' : ''}${c.is_priority ? ' ★' : ''} | ${c.phone || ''}`)
  // deno-lint-ignore no-explicit-any
  const produitsBlock = fmt(wd?.produits || [], 'Catalogue produits', (p: any) =>
    `  • ${p.name}${p.reference ? ' [' + p.reference + ']' : ''}${p.category ? ' — ' + p.category : ''} | ${p.price}€`)

  return `Tu es Neo, l'assistant IA intégré dans NeoFlow BOS, un logiciel de gestion pour magasins de literie.
Tu as accès aux données RÉELLES du magasin « ${shop} » en temps réel.

═══════════════════════════════════════
DONNÉES RÉELLES DU MAGASIN (maintenant)
═══════════════════════════════════════
${kpiBlock}

${commandesBlock}

${facturesBlock}

${devisBlock}

${livraisonsBlock}

${clientsBlock}

${produitsBlock}

═══════════════════════════════════════
CONTEXTE
═══════════════════════════════════════
Page ouverte : ${page}
Rôle : ${role}

═══════════════════════════════════════
RÈGLES
═══════════════════════════════════════
1. DONNÉES UNIQUEMENT : N'invente jamais. Si « aucun », dis-le clairement.
2. FRANÇAIS toujours, naturel et professionnel.
3. CONCIS : max 180 mots, direct, utile. Pas de remplissage.
4. CALCULS : Fais les calculs toi-même, donne la conclusion (pas juste les chiffres bruts).
5. GUIDAGE : Pour « comment faire », donne les étapes précises dans l'interface.
6. RÔLES : Livreur → livraisons seulement. Vendeur → pas les marges ni stats globales.

Tu connais NeoFlow BOS : vente rapide (POS), commandes avec acompte/solde, factures, devis, clients CRM, produits/stock, fournisseurs, livraisons kanban, statistiques.`
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
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

    const { message, context, history } = await req.json()
    if (!message?.trim()) throw new Error('Message vide')

    // Résoudre workspace_id
    let workspaceId = context?.workspace_id as string | undefined
    if (!workspaceId) {
      const { data: wsUser } = await supabase
        .from('workspace_users').select('workspace_id')
        .eq('user_id', user.id).limit(1).single()
      workspaceId = wsUser?.workspace_id
    }

    // Récupérer les données workspace
    const wd = workspaceId
      ? await fetchWorkspaceData(supabase, workspaceId)
      : { commandes: [], factures: [], devis: [], livraisons: [], clients: [], produits: [], kpis: {} }

    // Construire les messages pour Ollama
    const systemPrompt = buildSystemPrompt(context, wd)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: 'user', content: message },
    ]

    // Appel Ollama (direct, sans n8n)
    const ollamaUrl = Deno.env.get('OLLAMA_URL') || 'http://172.17.0.1:11434'
    const ollamaModel = Deno.env.get('OLLAMA_MODEL') || 'llama3.2:3b'

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
      throw new Error(`Ollama error ${ollamaRes.status}: ${err}`)
    }

    // Transformer le stream NDJSON d'Ollama en SSE pour le client
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Traiter le stream en arrière-plan
    ;(async () => {
      const reader = ollamaRes.body!.getReader()
      let buf = ''
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
            try {
              const json = JSON.parse(trimmed)
              const tok = json?.message?.content
              if (tok) {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ t: tok })}\n\n`))
              }
              if (json?.done === true) {
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
    // Pour les erreurs, retourner un SSE avec l'erreur
    return new Response(
      `data: ${JSON.stringify({ error: msg })}\n\ndata: [DONE]\n\n`,
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      }
    )
  }
})
