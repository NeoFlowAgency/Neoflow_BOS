import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Détection des besoins en données selon message + page ────────────────────

function detectDataNeeds(message: string, page: string) {
  const msg = message.toLowerCase()
  const p = page.toLowerCase()
  return {
    needsOrders:     msg.includes('commande') || p.includes('commande'),
    needsInvoices:   msg.includes('facture')  || p.includes('facture'),
    needsQuotes:     msg.includes('devis')    || p.includes('devis'),
    needsClients:    msg.includes('client')   || p.includes('client'),
    needsDeliveries: msg.includes('livraison')|| p.includes('livraison'),
    needsStock:      msg.includes('stock')    || msg.includes('produit') || p.includes('stock'),
  }
}

// ── Récupération des données workspace ───────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function fetchWorkspaceData(supabase: any, workspaceId: string, needs: ReturnType<typeof detectDataNeeds>) {
  const result: Record<string, unknown> = {}

  if (needs.needsOrders) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_number, status, total_ttc, amount_paid, remaining_amount, created_at, customers(name, phone)')
        .eq('workspace_id', workspaceId)
        .not('status', 'in', '(termine,annule)')
        .order('created_at', { ascending: false })
        .limit(20)
      if (!error && data?.length) result.commandes = data
    } catch { /* table peut ne pas exister */ }
  }

  if (needs.needsInvoices) {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, status, total_ttc, issue_date, customers(name)')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(15)
      if (!error && data?.length) result.factures = data
    } catch { /* ignore */ }
  }

  if (needs.needsQuotes) {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('quote_number, status, total_ttc, issue_date, customers(name)')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(15)
      if (!error && data?.length) result.devis = data
    } catch { /* ignore */ }
  }

  if (needs.needsClients) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('name, phone, email, city')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!error && data?.length) result.clients = data
    } catch { /* ignore */ }
  }

  if (needs.needsDeliveries) {
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .select('delivery_date, status, time_slot, customers(name)')
        .eq('workspace_id', workspaceId)
        .not('status', 'in', '(livree,annulee)')
        .order('delivery_date', { ascending: true })
        .limit(10)
      if (!error && data?.length) result.livraisons = data
    } catch { /* ignore */ }
  }

  if (needs.needsStock) {
    try {
      const { data, error } = await supabase
        .from('stock_levels')
        .select('quantity, products(name, reference)')
        .eq('workspace_id', workspaceId)
        .lte('quantity', 3)
        .limit(15)
      if (!error && data?.length) result.stock_alertes = data
    } catch { /* table peut ne pas exister */ }
  }

  return result
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifié')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifié')

    // Payload
    const { message, context, history } = await req.json()
    if (!message?.trim()) throw new Error('Message vide')

    // Résoudre le workspace_id
    let workspaceId = context?.workspace_id as string | undefined
    if (!workspaceId) {
      const { data: wsUser } = await supabase
        .from('workspace_users')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      workspaceId = wsUser?.workspace_id
    }

    // Récupérer les données du workspace si besoin
    let workspaceData: Record<string, unknown> = {}
    if (workspaceId) {
      const needs = detectDataNeeds(message, context?.page || '/')
      workspaceData = await fetchWorkspaceData(supabase, workspaceId, needs)
    }

    // Forward to n8n
    const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL')
    if (!n8nWebhookUrl) throw new Error('N8N_WEBHOOK_URL non configuré')

    const n8nRes = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        context: {
          page: context?.page || '/',
          role: context?.role || 'unknown',
          workspace_name: context?.workspace_name || 'NeoFlow BOS',
        },
        history: (history || []).slice(-8),
        user_id: user.id,
        workspaceData,
      }),
    })

    if (!n8nRes.ok) {
      const errText = await n8nRes.text()
      console.error('[neo-chat] n8n error:', n8nRes.status, errText)
      throw new Error(`Service IA indisponible (${n8nRes.status})`)
    }

    const data = await n8nRes.json()
    const reply = data.reply || data.text || data.message?.content || data.output || null

    if (!reply) {
      console.error('[neo-chat] n8n response had no reply field:', JSON.stringify(data))
      throw new Error('Réponse IA vide')
    }

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[neo-chat] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
