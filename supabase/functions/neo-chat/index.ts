import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifié')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifié')

    // ── Payload ───────────────────────────────────────────────────────────────
    const { message, context, history } = await req.json()
    if (!message?.trim()) throw new Error('Message vide')

    // ── Forward to n8n ────────────────────────────────────────────────────────
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
        history: (history || []).slice(-8), // derniers 8 messages pour le contexte
        user_id: user.id,
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
