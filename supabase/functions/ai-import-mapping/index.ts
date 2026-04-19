import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

const ENTITY_FIELDS: Record<string, { key: string; label: string; required?: boolean; type?: string }[]> = {
  clients: [
    { key: 'first_name', label: 'Prénom', required: true },
    { key: 'last_name',  label: 'Nom',    required: true },
    { key: 'email',      label: 'Email' },
    { key: 'phone',      label: 'Téléphone' },
    { key: 'address',    label: 'Adresse' },
  ],
  produits: [
    { key: 'name',           label: 'Nom produit',      required: true },
    { key: 'reference',      label: 'Référence / SKU' },
    { key: 'description',    label: 'Description' },
    { key: 'unit_price_ht',  label: 'Prix HT (€)',      type: 'number' },
    { key: 'tax_rate',       label: 'TVA (%)',           type: 'number' },
    { key: 'cost_price_ht',  label: "Prix d'achat HT",  type: 'number' },
    { key: 'category',       label: 'Catégorie' },
    { key: 'warranty_years', label: 'Garantie (ans)',   type: 'number' },
  ],
  fournisseurs: [
    { key: 'name',         label: 'Nom société',  required: true },
    { key: 'contact_name', label: 'Contact' },
    { key: 'email',        label: 'Email' },
    { key: 'phone',        label: 'Téléphone' },
    { key: 'address',      label: 'Adresse' },
    { key: 'postal_code',  label: 'Code postal' },
    { key: 'city',         label: 'Ville' },
    { key: 'notes',        label: 'Notes' },
  ],
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const body = await req.json()
    const { headers, sampleRows, entityType, userMessage, currentMapping } = body

    const fields = ENTITY_FIELDS[entityType as string]
    if (!fields) {
      return new Response(JSON.stringify({ error: 'Type entité invalide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) throw new Error('OPENROUTER_API_KEY non configurée')

    const schemaDesc = fields
      .map(f => `• ${f.key} — "${f.label}"${f.required ? ' [REQUIS]' : ''}${f.type === 'number' ? ' [NUMÉRIQUE]' : ''}`)
      .join('\n')

    const headersDesc = (headers as string[])
      .map((h, i) => `${i + 1}. "${h}"`)
      .join('\n')

    const sampleDesc = JSON.stringify((sampleRows as unknown[]).slice(0, 3), null, 2)

    const prompt = `Tu es un expert en migration de données entre ERP/e-commerce et NeoFlow BOS.

TÂCHE : Analyser les colonnes d'un fichier CSV/Excel et créer un mapping intelligent vers le schéma NeoFlow.

SCHÉMA CIBLE (entité : ${entityType}) :
${schemaDesc}

COLONNES DU FICHIER SOURCE :
${headersDesc}

DONNÉES EXEMPLE (3 premières lignes) :
${sampleDesc}
${currentMapping ? `\nMAPPING ACTUEL À AFFINER :\n${JSON.stringify(currentMapping, null, 2)}\n` : ''}${userMessage ? `\nCORRECTION DEMANDÉE : "${userMessage}"\n` : ''}
RÈGLES :
1. Analyser le NOM des colonnes ET le contenu des données pour déduire leur sens
2. Plusieurs colonnes source peuvent alimenter un seul champ cible (elles seront concaténées)
3. Pour les champs numériques, utiliser transform "number" (enlève €, %, convertit virgule en point)
4. TOUJOURS inclure tous les champs cibles dans la réponse, même ceux sans correspondance (sourceColumns vide)
5. L'explication doit être en français, 2-3 phrases max, mentionner les fusions et champs non trouvés

RÉPONDRE UNIQUEMENT avec ce JSON valide (SANS markdown, SANS backticks) :
{
  "mappings": [
    { "targetField": "name", "sourceColumns": ["Nom produit"], "transform": "direct" },
    { "targetField": "description", "sourceColumns": ["Desc taille", "Desc matière"], "transform": "concat", "concatSeparator": " — " },
    { "targetField": "unit_price_ht", "sourceColumns": ["Prix"], "transform": "number" },
    { "targetField": "tax_rate", "sourceColumns": [], "transform": "direct" }
  ],
  "explanation": "Explication en français..."
}`

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bos.neoflow-agency.cloud',
        'X-Title': 'NeoFlow BOS Import',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`OpenRouter erreur ${resp.status}: ${errText.slice(0, 200)}`)
    }

    const aiResult = await resp.json()
    const content: string = aiResult.choices?.[0]?.message?.content || ''

    // Strip potential markdown fences
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error('Réponse IA invalide : ' + cleaned.slice(0, 300))
    }

    // Ensure all target fields are present
    const existingKeys = new Set((parsed.mappings as { targetField: string }[]).map(m => m.targetField))
    for (const f of fields) {
      if (!existingKeys.has(f.key)) {
        parsed.mappings.push({ targetField: f.key, sourceColumns: [], transform: 'direct' })
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
