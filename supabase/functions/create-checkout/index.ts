import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const defaultPriceId = Deno.env.get('STRIPE_PRICE_ID')
    // Early access one-time price (29€) - hardcoded to avoid env var misconfiguration
    const EARLY_ACCESS_PRICE_ID = 'price_1T30pHApeYuOBUUXshjPCUOK'
    const earlyAccessPriceId = Deno.env.get('STRIPE_EARLY_ACCESS_PRICE_ID') || EARLY_ACCESS_PRICE_ID
    if (!stripeKey) {
      throw new Error('Stripe configuration manquante')
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

    // Verify authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifie')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifie')

    const { workspace_id, success_url, cancel_url, plan: rawPlan } = await req.json()
    if (!workspace_id) throw new Error('workspace_id requis')

    // Before launch (25 feb 2026), ALL checkouts are early-access one-time payment
    const LAUNCH_DATE = new Date('2026-02-25T00:01:00+01:00')
    const plan = (new Date() < LAUNCH_DATE) ? 'early-access' : rawPlan

    // Verify user is owner of this workspace
    const { data: membership } = await supabase
      .from('workspace_users')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (membership?.role !== 'proprietaire') {
      throw new Error('Seul le proprietaire du workspace peut creer un abonnement')
    }

    // Early access: enforce max 3 workspaces per user
    if (plan === 'early-access') {
      const { count } = await supabase
        .from('workspace_users')
        .select('workspace_id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'proprietaire')
      if ((count || 0) > 3) {
        throw new Error('Maximum 3 workspaces en acces anticipe. Contactez le support pour en ajouter.')
      }
    }

    // Get workspace info
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, stripe_customer_id')
      .eq('id', workspace_id)
      .single()

    if (!workspace) throw new Error('Workspace introuvable')

    // Create or reuse Stripe customer
    let customerId = workspace.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: workspace.name,
        metadata: {
          workspace_id: workspace.id,
          user_id: user.id,
        },
      })
      customerId = customer.id

      await supabase
        .from('workspaces')
        .update({ stripe_customer_id: customerId })
        .eq('id', workspace_id)
    }

    const origin = req.headers.get('origin') || 'http://localhost:5173'
    let session

    if (plan === 'early-access') {
      // Early access: one-time payment 29€ (not subscription)
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{ price: earlyAccessPriceId, quantity: 1 }],
        metadata: { workspace_id: workspace.id, plan: 'early-access' },
        success_url: success_url || `${origin}/dashboard?checkout=success`,
        cancel_url: cancel_url || `${origin}/onboarding/workspace?checkout=canceled`,
      })

      // Mark workspace as early-access
      await supabase
        .from('workspaces')
        .update({ plan_type: 'early-access' })
        .eq('id', workspace_id)
    } else {
      // Standard: subscription with 7-day trial
      const priceId = defaultPriceId
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: 7,
          metadata: { workspace_id: workspace.id },
        },
        metadata: { workspace_id: workspace.id, plan: plan || 'default' },
        success_url: success_url || `${origin}/dashboard?checkout=success`,
        cancel_url: cancel_url || `${origin}/onboarding/workspace?checkout=canceled`,
      })
    }

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[create-checkout] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
