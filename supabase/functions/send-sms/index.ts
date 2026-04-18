// ============================================================
// NeoFlow BOS - Edge Function: send-sms
// Deploy: supabase functions deploy send-sms --no-verify-jwt
// ============================================================
// Input:
//   { workspace_id, to, message }
//   OR { workspace_id, to, template, variables }
//
// L'API key Brevo est stockée dans workspaces.sms_api_key
// Le nom expéditeur dans workspaces.sms_sender_name
//
// Output: { success: boolean, message_id?: string }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms'

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const token = authHeader.replace('Bearer ', '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

    if (token !== serviceRoleKey) {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Accès refusé' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    const body = await req.json()
    const { workspace_id, to, message, template, variables } = body

    if (!workspace_id || !to) {
      return new Response(JSON.stringify({ error: 'workspace_id et to sont requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Récupérer les paramètres SMS du workspace
    const { data: ws, error: wsError } = await supabase
      .from('workspaces')
      .select('sms_api_key, sms_sender_name, name, sms_template_order_confirm, sms_template_delivery_reminder, sms_template_post_delivery')
      .eq('id', workspace_id)
      .single()

    if (wsError || !ws) {
      return new Response(JSON.stringify({ error: 'Workspace introuvable' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!ws.sms_api_key) {
      return new Response(JSON.stringify({ error: 'Aucune clé API SMS configurée pour ce workspace' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Construire le message final
    let finalMessage = message || ''

    if (!finalMessage && template) {
      const templateMap: Record<string, string> = {
        order_confirm:         ws.sms_template_order_confirm || '',
        delivery_reminder:     ws.sms_template_delivery_reminder || '',
        post_delivery:         ws.sms_template_post_delivery || '',
      }
      const tmpl = templateMap[template]
      if (!tmpl) {
        return new Response(JSON.stringify({ error: `Template inconnu: ${template}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      finalMessage = applyTemplate(tmpl, { magasin: ws.name || 'Votre magasin', ...(variables || {}) })
    }

    if (!finalMessage) {
      return new Response(JSON.stringify({ error: 'message ou template requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Normaliser le numéro (format E.164 international)
    let phone = to.replace(/\s/g, '')
    if (phone.startsWith('0')) phone = '+33' + phone.slice(1)
    if (!phone.startsWith('+')) phone = '+' + phone

    // Appel API Brevo SMS
    const brevoResp = await fetch(BREVO_SMS_URL, {
      method: 'POST',
      headers: {
        'api-key': ws.sms_api_key,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: (ws.sms_sender_name || 'NeoFlow').slice(0, 11),
        recipient: phone,
        content: finalMessage.slice(0, 160),
      }),
    })

    const brevoData = await brevoResp.json().catch(() => ({}))

    if (!brevoResp.ok) {
      console.error('[send-sms] Brevo error:', brevoResp.status, JSON.stringify(brevoData))
      return new Response(
        JSON.stringify({ error: brevoData?.message || `Erreur Brevo ${brevoResp.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message_id: brevoData?.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-sms] Error:', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
