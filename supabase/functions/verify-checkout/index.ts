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

    // No Stripe customer - can't verify
    if (!workspace.stripe_customer_id) {
      return new Response(
        JSON.stringify({ success: true, is_active: false, message: 'Aucun abonnement Stripe trouvé' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check Stripe for subscriptions
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })
    const subscriptions = await stripe.subscriptions.list({
      customer: workspace.stripe_customer_id,
      limit: 5,
    })

    // Find an active or trialing subscription
    const activeSub = subscriptions.data.find(
      (s: Stripe.Subscription) => ['active', 'trialing'].includes(s.status)
    )

    if (activeSub) {
      // Activate workspace
      await supabase.from('workspaces').update({
        stripe_subscription_id: activeSub.id,
        subscription_status: activeSub.status,
        is_active: true,
        trial_ends_at: activeSub.trial_end
          ? new Date(activeSub.trial_end * 1000).toISOString()
          : null,
        current_period_end: new Date(activeSub.current_period_end * 1000).toISOString(),
      }).eq('id', workspace_id)

      console.log(`[verify-checkout] Activated workspace=${workspace_id} status=${activeSub.status}`)

      return new Response(
        JSON.stringify({ success: true, is_active: true, subscription_status: activeSub.status }),
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
