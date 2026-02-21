// ============================================================
// NeoFlow BOS - Edge Function: send-email
// Deploy: supabase functions deploy send-email
// ============================================================
// Input: { to: string, subject: string, html: string }
// Output: { success: boolean }
//
// Prerequisites - set secrets:
//   supabase secrets set SMTP_HOST=smtp.gmail.com
//   supabase secrets set SMTP_PORT=587
//   supabase secrets set SMTP_USER=contacte.neoflowbos@gmail.com
//   supabase secrets set SMTP_PASS=xxxx
//   supabase secrets set SMTP_FROM="NeoFlow BOS <contacte.neoflowbos@gmail.com>"
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html } = await req.json()

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'to, subject, and html are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPass = Deno.env.get('SMTP_PASS')
    const smtpFrom = Deno.env.get('SMTP_FROM') || smtpUser || ''

    if (!smtpUser || !smtpPass) {
      return new Response(
        JSON.stringify({
          error: 'SMTP credentials not configured. Set SMTP_USER and SMTP_PASS secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPass,
        },
      },
    })

    await client.send({
      from: smtpFrom,
      to,
      subject,
      content: 'auto',
      html,
    })

    await client.close()

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[send-email] Error:', msg, error)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
