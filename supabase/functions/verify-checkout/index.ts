import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const ALLOWED_ORIGINS = [
  'https://bos.neoflow-agency.cloud',
  'http://localhost:5173',
  'http://localhost:3000',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      throw new Error('Stripe non configuré')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifie')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifie')

    const { workspace_id } = await req.json()
    if (!workspace_id) throw new Error('workspace_id requis')

    // Get workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, stripe_customer_id, stripe_subscription_id, is_active, subscription_status')
      .eq('id', workspace_id)
      .single()

    if (!workspace) throw new Error('Workspace introuvable')

    // Already active
    if (workspace.is_active) {
      return new Response(
        JSON.stringify({ success: true, is_active: true, subscription_status: workspace.subscription_status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

    // No Stripe customer - can't verify
    if (!workspace.stripe_customer_id) {
      return new Response(
        JSON.stringify({ success: true, is_active: false, message: 'Aucun abonnement Stripe trouvé' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check Stripe for subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: workspace.stripe_customer_id,
      limit: 5,
    })

    // Find an active or trialing subscription
    const activeSub = subscriptions.data.find(
      (s: Stripe.Subscription) => ['active', 'trialing'].includes(s.status)
    )

    if (activeSub) {
      // Déduire le plan depuis les métadonnées ou le price_id
      let planType = activeSub.metadata?.plan_type || ''
      if (!['basic', 'pro', 'enterprise'].includes(planType)) {
        const priceId = (activeSub.items?.data[0]?.price as Stripe.Price)?.id || ''
        const basicMonthly = Deno.env.get('STRIPE_BASIC_MONTHLY_PRICE_ID') || ''
        const basicAnnual  = Deno.env.get('STRIPE_BASIC_ANNUAL_PRICE_ID') || ''
        if (priceId && (priceId === basicMonthly || priceId === basicAnnual)) {
          planType = 'basic'
        } else {
          planType = 'pro'
        }
      }

      const monthlyAllowance = planType === 'enterprise' ? -1 : planType === 'basic' ? 200 : 2000

      // Activer le workspace avec le bon plan
      await supabase.from('workspaces').update({
        stripe_subscription_id: activeSub.id,
        subscription_status: activeSub.status,
        is_active: true,
        plan_type: planType,
        trial_ends_at: activeSub.trial_end
          ? new Date(activeSub.trial_end * 1000).toISOString()
          : null,
        current_period_end: new Date(activeSub.current_period_end * 1000).toISOString(),
      }).eq('id', workspace_id)

      // Initialiser les tokens selon le plan (si pas déjà fait)
      await supabase.from('neo_credits').upsert({
        workspace_id,
        credits_balance: monthlyAllowance,
        monthly_allowance: monthlyAllowance,
        credits_used_this_month: 0,
        extra_credits: 0,
        last_reset_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' })

      console.log(`[verify-checkout] Activated workspace=${workspace_id} plan=${planType} status=${activeSub.status}`)

      return new Response(
        JSON.stringify({ success: true, is_active: true, subscription_status: activeSub.status, plan_type: planType }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // No active subscription found
    console.log(`[verify-checkout] No active subscription for workspace=${workspace_id}`)
    return new Response(
      JSON.stringify({ success: true, is_active: false, subscription_status: 'none' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[verify-checkout] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
