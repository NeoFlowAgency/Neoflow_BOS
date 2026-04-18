// ============================================================
// NeoFlow BOS - Edge Function: ocr-import
// Deploy: supabase functions deploy ocr-import --no-verify-jwt
// Input:  { imageBase64: string, entityType: 'produits'|'clients'|'fournisseurs' }
// Output: { data: object }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://bos.neoflow-agency.cloud',
  'http://localhost:5173',
  'http://localhost:3000',
]

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const ENTITY_PROMPTS: Record<string, string> = {
  produits: `Analyse cette image de fiche produit et extrait les informations en JSON strict (sans markdown).
Champs attendus: name (string), reference (string ou null), description (string ou null),
unit_price_ht (nombre décimal ou null), tax_rate (nombre ex: 20 ou null),
cost_price_ht (nombre ou null), category (string ou null), warranty_years (entier ou null).
Réponds UNIQUEMENT avec le JSON, rien d'autre.`,

  clients: `Analyse cette image et extrait les informations du client en JSON strict (sans markdown).
Champs: first_name (string), last_name (string), email (string ou null),
phone (string ou null), address (string ou null).
Réponds UNIQUEMENT avec le JSON, rien d'autre.`,

  fournisseurs: `Analyse cette image et extrait les informations du fournisseur en JSON strict (sans markdown).
Champs: name (string), contact_name (string ou null), email (string ou null),
phone (string ou null), address (string ou null), postal_code (string ou null), city (string ou null).
Réponds UNIQUEMENT avec le JSON, rien d'autre.`,
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const token = authHeader.replace('Bearer ', '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
    if (token !== serviceKey) {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) {
        return new Response(JSON.stringify({ error: 'Accès refusé' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const { imageBase64, entityType = 'produits' } = await req.json()
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'imageBase64 requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openrouterKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!openrouterKey) {
      return new Response(JSON.stringify({ error: 'Clé OpenRouter non configurée' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const prompt = ENTITY_PROMPTS[entityType] || ENTITY_PROMPTS.produits

    const orResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bos.neoflow-agency.cloud',
        'X-Title': 'NeoFlow BOS OCR',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ],
        }],
        temperature: 0.1,
        max_tokens: 512,
      }),
    })

    if (!orResp.ok) {
      const errText = await orResp.text()
      console.error('[ocr-import] OpenRouter error:', orResp.status, errText)
      return new Response(JSON.stringify({ error: `Erreur modèle IA: ${orResp.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const orData = await orResp.json()
    const content = orData.choices?.[0]?.message?.content || '{}'

    let parsed: Record<string, unknown> = {}
    try {
      const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      console.warn('[ocr-import] JSON parse failed:', content)
    }

    return new Response(JSON.stringify({ data: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ocr-import] Error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
