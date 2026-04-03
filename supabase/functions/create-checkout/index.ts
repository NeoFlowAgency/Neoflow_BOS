import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

import { getCorsHeaders } from '../_shared/cors.ts'

// Mapping plan → price IDs (secrets Supabase)
// Secrets à configurer :
//   STRIPE_BASIC_MONTHLY_PRICE_ID  — Basic 19€/mois
//   STRIPE_BASIC_ANNUAL_PRICE_ID   — Basic annuel (optionnel)
//   STRIPE_PRO_MONTHLY_PRICE_ID    — Pro 49€/mois (= ancien STRIPE_PRICE_ID)
//   STRIPE_PRO_ANNUAL_PRICE_ID     — Pro annuel (= ancien STRIPE_ANNUAL_PRICE_ID)
// Rétrocompatibilité : STRIPE_PRICE_ID et STRIPE_ANNUAL_PRICE_ID toujours acceptés pour Pro

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) throw new Error('Stripe configuration manquante')

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifie')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifie')

    const { workspace_id, success_url, cancel_url, billing: rawBilling, plan_type: rawPlan } = await req.json()
    if (!workspace_id) throw new Error('workspace_id requis')

    // Paramètres
    const billing = rawBilling === 'annual' ? 'annual' : 'monthly'
    const planType = rawPlan === 'basic' ? 'basic' : 'pro'

    // Résoudre le price ID selon le plan et la fréquence
    let priceId: string | undefined

    if (planType === 'basic') {
      priceId = billing === 'annual'
        ? Deno.env.get('STRIPE_BASIC_ANNUAL_PRICE_ID') || Deno.env.get('STRIPE_BASIC_MONTHLY_PRICE_ID')
        : Deno.env.get('STRIPE_BASIC_MONTHLY_PRICE_ID')
    } else {
      // Pro — rétrocompatibilité avec les anciens secrets
      priceId = billing === 'annual'
        ? (Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID') || Deno.env.get('STRIPE_ANNUAL_PRICE_ID'))
        : (Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID') || Deno.env.get('STRIPE_PRICE_ID'))
    }

    if (!priceId) {
      throw new Error(`Prix Stripe non configuré pour le plan "${planType}" en mode "${billing}"`)
    }

    // Vérifier que l'utilisateur est propriétaire du workspace
    const { data: membership } = await supabase
      .from('workspace_users')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (membership?.role !== 'proprietaire') {
      throw new Error('Seul le proprietaire du workspace peut creer un abonnement')
    }

    // Récupérer le workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, stripe_customer_id')
      .eq('id', workspace_id)
      .single()

    if (!workspace) throw new Error('Workspace introuvable')

    // Créer ou réutiliser le customer Stripe
    let customerId = workspace.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: workspace.name,
        metadata: { workspace_id: workspace.id, user_id: user.id },
      })
      customerId = customer.id

      await supabase
        .from('workspaces')
        .update({ stripe_customer_id: customerId })
        .eq('id', workspace_id)
    }

    const origin = req.headers.get('origin') || 'http://localhost:5173'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 7,
        metadata: { workspace_id: workspace.id, plan_type: planType },
      },
      metadata: { workspace_id: workspace.id, billing, plan_type: planType },
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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
