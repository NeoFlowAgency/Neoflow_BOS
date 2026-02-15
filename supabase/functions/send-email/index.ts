// ============================================================
// NeoFlow BOS - Edge Function: send-email
// Deploy: supabase functions deploy send-email
// ============================================================
// Input: { to: string, subject: string, html: string }
// Output: { success: boolean }
//
// Prerequisites:
// - Set RESEND_API_KEY secret: supabase secrets set RESEND_API_KEY=re_xxxxx
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, from } = await req.json()

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'to, subject, and html are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured. Set it with: supabase secrets set RESEND_API_KEY=re_xxxxx' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || 'NeoFlow BOS <noreply@neoflow.agency>',
        to: [to],
        subject,
        html,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erreur envoi email via Resend')
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
