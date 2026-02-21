// IMPORTANT: Deploy with --no-verify-jwt flag
// supabase functions deploy stripe-webhook --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!stripeKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: 'Stripe config manquante' }), { status: 500 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-04-10' })

  // Verify webhook signature
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig!, webhookSecret)
  } catch (err: unknown) {
    console.error('[stripe-webhook] Signature invalide:', (err as Error).message)
    return new Response(JSON.stringify({ error: 'Signature invalide' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    switch (event.type) {
      // ─── Checkout termine ───────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const workspaceId = session.metadata?.workspace_id
        const plan = session.metadata?.plan
        const subscriptionId = session.subscription as string

        // Early access: one-time payment (no subscription)
        if (plan === 'early-access' && workspaceId && !subscriptionId) {
          await supabase.from('workspaces').update({
            subscription_status: 'early_access',
            is_active: true,
            plan_type: 'early-access',
            stripe_payment_intent_id: session.payment_intent as string,
          }).eq('id', workspaceId)

          // Send confirmation email
          try {
            const { data: ws } = await supabase
              .from('workspaces')
              .select('name, owner_user_id')
              .eq('id', workspaceId)
              .single()

            if (ws?.owner_user_id) {
              const { data: { user: owner } } = await supabase.auth.admin.getUserById(ws.owner_user_id)
              if (owner?.email) {
                const supabaseUrl = Deno.env.get('SUPABASE_URL')!
                const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
                await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceKey}`,
                  },
                  body: JSON.stringify({
                    to: owner.email,
                    subject: 'Bienvenue en Acces Anticipe NeoFlow BOS !',
                    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
                      <div style="text-align:center;margin-bottom:30px">
                        <h1 style="color:#040741;margin:0">NeoFlow BOS</h1>
                        <p style="color:#313ADF;font-weight:bold;margin:5px 0">Acces Anticipe</p>
                      </div>
                      <h2 style="color:#040741">Votre acces anticipe est active !</h2>
                      <p>Bonjour ${owner.user_metadata?.full_name || ''},</p>
                      <p>Merci pour votre confiance ! Votre paiement pour le workspace <strong>${ws.name}</strong> a ete confirme.</p>
                      <p>L'application sera pleinement accessible a partir du <strong>25 fevrier 2026 a 00h01</strong>.</p>
                      <p>D'ici la, vous pouvez vous connecter pour :</p>
                      <ul>
                        <li>Modifier vos informations personnelles</li>
                        <li>Configurer votre workspace (adresse, SIRET, logo, etc.)</li>
                        <li>Acceder au support</li>
                      </ul>
                      <p style="margin-top:30px">A tres bientot !<br><strong>L'equipe NeoFlow</strong></p>
                      <hr style="border:none;border-top:1px solid #eee;margin:30px 0" />
                      <p style="color:#999;font-size:12px;text-align:center">NeoFlow BOS - Propulse par Neoflow Agency</p>
                    </div>`,
                  }),
                })
              }
            }
          } catch (emailErr) {
            console.error('[stripe-webhook] Error sending early access email:', emailErr)
          }

          console.log(`[stripe-webhook] early-access completed: workspace=${workspaceId}`)
          break
        }

        // Standard: subscription checkout
        if (workspaceId && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)

          await supabase.from('workspaces').update({
            stripe_subscription_id: subscriptionId,
            subscription_status: subscription.status, // 'trialing'
            is_active: true,
            trial_ends_at: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toISOString()
              : null,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }).eq('id', workspaceId)

          console.log(`[stripe-webhook] checkout.session.completed: workspace=${workspaceId} status=${subscription.status}`)
        }
        break
      }

      // ─── Facture payee ──────────────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string

        if (subscriptionId) {
          const { data: workspace } = await supabase
            .from('workspaces')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single()

          if (workspace) {
            await supabase.from('workspaces').update({
              subscription_status: 'active',
              is_active: true,
              grace_period_until: null,
            }).eq('id', workspace.id)

            console.log(`[stripe-webhook] invoice.paid: workspace=${workspace.id}`)
          }
        }
        break
      }

      // ─── Echec de paiement ──────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string

        if (subscriptionId) {
          const { data: workspace } = await supabase
            .from('workspaces')
            .select('id')
            .eq('stripe_subscription_id', subscriptionId)
            .single()

          if (workspace) {
            const gracePeriodEnd = new Date()
            gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3)

            await supabase.from('workspaces').update({
              subscription_status: 'past_due',
              grace_period_until: gracePeriodEnd.toISOString(),
            }).eq('id', workspace.id)

            console.log(`[stripe-webhook] invoice.payment_failed: workspace=${workspace.id} grace_until=${gracePeriodEnd.toISOString()}`)
          }
        }
        break
      }

      // ─── Subscription mise a jour ───────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single()

        if (workspace) {
          const isActiveStatus = ['active', 'trialing', 'past_due'].includes(subscription.status)

          await supabase.from('workspaces').update({
            subscription_status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            is_active: isActiveStatus,
          }).eq('id', workspace.id)

          console.log(`[stripe-webhook] subscription.updated: workspace=${workspace.id} status=${subscription.status}`)
        }
        break
      }

      // ─── Subscription supprimee ─────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        const { data: workspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('stripe_subscription_id', subscription.id)
          .single()

        if (workspace) {
          await supabase.from('workspaces').update({
            subscription_status: 'canceled',
            is_active: false,
          }).eq('id', workspace.id)

          console.log(`[stripe-webhook] subscription.deleted: workspace=${workspace.id}`)
        }
        break
      }

      default:
        console.log(`[stripe-webhook] Event non gere: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[stripe-webhook] Handler error:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
})
