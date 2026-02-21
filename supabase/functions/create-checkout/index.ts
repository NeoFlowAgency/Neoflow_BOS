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
    const priceId = Deno.env.get('STRIPE_PRICE_ID')
    if (!stripeKey || !priceId) {
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

    const { workspace_id, success_url, cancel_url } = await req.json()
    if (!workspace_id) throw new Error('workspace_id requis')

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

    // Create Checkout Session with 7-day trial
    const origin = req.headers.get('origin') || 'http://localhost:5173'
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { workspace_id: workspace.id },
      },
      metadata: { workspace_id: workspace.id },
      success_url: success_url || `${origin}/dashboard?checkout=success`,
      cancel_url: cancel_url || `${origin}/onboarding/workspace?checkout=canceled`,
    })

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
