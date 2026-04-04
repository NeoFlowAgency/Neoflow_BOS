// supabase functions deploy buy-credits --no-verify-jwt
// Crée une Stripe Checkout session one-time pour acheter des NeoCredits supplémentaires

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

function getCorsHeaders(req: Request) {
  const ALLOWED_ORIGINS = [
    'https://bos.neoflow-agency.cloud',
    'http://localhost:5173',
    'http://localhost:3000',
  ]
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// Packs de crédits disponibles
// Configuré via le secret STRIPE_CREDITS_PRICE_ID (product Stripe à créer une fois)
// Le client envoie { workspace_id, pack } où pack = '500' | '1000' | '2000'
// On utilise le même price ID Stripe et on ajuste la quantité

const CREDIT_PACKS: Record<string, { credits: number; label: string }> = {
  '500':  { credits: 500,  label: '500 NeoCredits' },
  '1000': { credits: 1000, label: '1 000 NeoCredits' },
  '2000': { credits: 2000, label: '2 000 NeoCredits' },
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const creditsPriceId = Deno.env.get('STRIPE_CREDITS_PRICE_ID')

    if (!stripeKey) throw new Error('Stripe non configuré')
    if (!creditsPriceId) throw new Error('STRIPE_CREDITS_PRICE_ID non configuré')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifié')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifié')

    const { workspace_id, pack = '500' } = await req.json()
    if (!workspace_id) throw new Error('workspace_id requis')

    const packInfo = CREDIT_PACKS[pack]
    if (!packInfo) throw new Error(`Pack "${pack}" invalide. Valeurs acceptées: 500, 1000, 2000`)

    // Vérifier que l'utilisateur est propriétaire
    const { data: membership } = await supabase
      .from('workspace_users')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (membership?.role !== 'proprietaire') {
      throw new Error('Seul le propriétaire peut acheter des crédits')
    }

    // Récupérer ou créer le customer Stripe
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, stripe_customer_id')
      .eq('id', workspace_id)
      .single()

    if (!workspace) throw new Error('Workspace introuvable')

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

    let customerId = workspace.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: workspace.name,
        metadata: { workspace_id: workspace.id, user_id: user.id },
      })
      customerId = customer.id
      await supabase.from('workspaces').update({ stripe_customer_id: customerId }).eq('id', workspace_id)
    }

    const origin = req.headers.get('origin') || 'http://localhost:5173'

    // Checkout one-time (mode: 'payment')
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price: creditsPriceId,
        quantity: packInfo.credits / 500, // 1 unité = 500 crédits
      }],
      metadata: {
        workspace_id: workspace.id,
        credits_to_add: String(packInfo.credits),
        user_id: user.id,
        type: 'neo_credits',
      },
      success_url: `${origin}/settings?tab=abonnement&credits=success`,
      cancel_url: `${origin}/settings?tab=abonnement`,
    })

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[buy-credits] Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
