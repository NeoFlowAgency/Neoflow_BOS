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
    if (!stripeKey) throw new Error('Stripe configuration manquante')

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifie')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifie')

    const { workspace_id, return_url } = await req.json()
    if (!workspace_id) throw new Error('workspace_id requis')

    // Verify user is owner
    const { data: membership } = await supabase
      .from('workspace_users')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (membership?.role !== 'owner') {
      throw new Error('Seul le proprietaire peut gerer la facturation')
    }

    // Get stripe_customer_id
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('stripe_customer_id')
      .eq('id', workspace_id)
      .single()

    if (!workspace?.stripe_customer_id) {
      throw new Error('Aucun compte de facturation trouve')
    }

    const origin = req.headers.get('origin') || 'http://localhost:5173'
    const session = await stripe.billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      return_url: return_url || `${origin}/settings`,
    })

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[create-portal-session] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
