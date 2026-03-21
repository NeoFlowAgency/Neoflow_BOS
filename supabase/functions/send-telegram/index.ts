import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

    if (!botToken || !chatId) {
      throw new Error('Telegram non configure')
    }

    const { file_base64, file_mime, file_name, caption } = await req.json()

    if (!file_base64 || !file_mime || !file_name) {
      throw new Error('file_base64, file_mime et file_name sont requis')
    }

    // Decode base64 to binary
    const binaryStr = atob(file_base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('photo', new Blob([bytes], { type: file_mime }), file_name)
    if (caption) formData.append('caption', caption)

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    })

    const result = await res.json()

    if (!res.ok) {
      console.error('[send-telegram] Telegram API error:', JSON.stringify(result))
      throw new Error(`Telegram error: ${result.description || res.status}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[send-telegram] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
