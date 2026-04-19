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
    { key: 'name',           label: 'Nom produit',     required: true },
    { key: 'reference',      label: 'Référence / SKU' },
    { key: 'description',    label: 'Description' },
    { key: 'unit_price_ht',  label: 'Prix HT (€)',     type: 'number' },
    { key: 'tax_rate',       label: 'TVA (%)',          type: 'number' },
    { key: 'cost_price_ht',  label: "Prix d'achat HT", type: 'number' },
    { key: 'category',                 label: 'Catégorie' },
    { key: 'warranty_years',           label: 'Garantie (ans)',        type: 'number' },
    { key: 'eco_participation_amount', label: 'Éco-participation (€)', type: 'number' },
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

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurée')

    const schemaLines = fields.map(f =>
      `  - ${f.key}${f.required ? ' [REQUIS]' : ''} : "${f.label}"${f.type === 'number' ? ' → nombre décimal' : ''}`
    ).join('\n')

    const headersWithIndex = (headers as string[]).map((h, i) => `  ${i + 1}. "${h}"`).join('\n')
    const sampleJSON = JSON.stringify((sampleRows as unknown[]).slice(0, 5), null, 2)
    const existingMappings = currentMapping?.mappings ?? currentMapping ?? null
    const isCorrection = !!(userMessage && existingMappings)

    // ── Correction prompt (minimal, surgical) ──────────────��───────────────────
    const correctionPrompt = `Tu es un assistant de migration de données. Modifie ce mapping JSON selon la correction demandée.

MAPPING ACTUEL :
${JSON.stringify(existingMappings, null, 2)}

CORRECTION : "${userMessage}"

COLONNES DISPONIBLES :
${headersWithIndex}

RÈGLE : Modifie UNIQUEMENT ce que la correction demande. Garde tous les autres champs exactement identiques.

Réponds UNIQUEMENT avec le JSON modifié (sans markdown) :
{
  "mappings": [...],
  "explanation": "Ce qui a été modifié, en français, 1 phrase."
}`

    // ── Initial analysis prompt (chain-of-thought) ─────────────────────��───────
    const analysisSystemPrompt = `Tu es un expert en migration de données depuis des logiciels métier (ERP, CRM, e-commerce) vers NeoFlow BOS, un logiciel de gestion commerciale français.

Tu connais parfaitement les exports de : Dolibarr, EBP, Sage, WooCommerce, Shopify, Odoo, PrestaShop, Cegid, QuickBooks.
Tu sais que :
- Les colonnes numériques peuvent utiliser la virgule comme séparateur décimal
- Les colonnes peuvent avoir des accents ou des underscores
- Un même concept peut avoir des noms très différents selon le logiciel source
- Plusieurs colonnes source peuvent être fusionnées en un seul champ NeoFlow`

    const analysisUserPrompt = `## DONNÉES À ANALYSER

Entité cible : **${entityType}**

### Schéma NeoFlow cible :
${schemaLines}

### Colonnes du fichier source (${(headers as string[]).length} colonnes) :
${headersWithIndex}

### Données exemple (${Math.min((sampleRows as unknown[]).length, 5)} premières lignes) :
\`\`\`json
${sampleJSON}
\`\`\`

---

## INSTRUCTIONS

Procède en 3 étapes mentales AVANT de répondre :

**Étape 1 – Analyse sémantique**
Pour chaque colonne source, détermine son sens réel en croisant son nom ET son contenu.
Exemple : "regular_price" avec valeur "299,00" → Prix HT probable (si pas de "prix_ttc" visible).
Cherche les colonnes ambiguës, les données encodées, les unités.

**Étape 2 – Mapping optimal**
Mappe chaque champ NeoFlow vers la/les meilleure(s) colonne(s) source.
Si plusieurs colonnes contribuent au même champ (ex: 3 colonnes description), utilise transform "concat".
Si une colonne contient des chiffres avec virgule/symbole €, utilise transform "number".
Si un champ NeoFlow n'a aucune correspondance évidente, laisse sourceColumns vide.

${entityType === 'produits' ? `**Étape 3 – Détection variantes**
Examine si des lignes ont le MÊME nom de produit mais des caractéristiques DIFFÉRENTES (taille/dimensions, confort/fermeté, couleur).
IMPORTANT : ne déclare detected=true QUE SI tu es certain qu'il y a de vraies variantes (même produit, tailles différentes).
Si oui : identifie la colonne source qui contient la taille/dimension (ex: "160x200", "140x190" — une seule valeur par ligne).
Si la taille est répartie sur 2 colonnes (largeur + longueur séparées), indique la colonne la plus utile.
Remplis le champ "variantSuggestion" en conséquence.` : ''}

---

## FORMAT DE RÉPONSE

Réponds UNIQUEMENT avec ce JSON valide (SANS markdown, SANS backticks) :
{
  "mappings": [
    { "targetField": "name", "sourceColumns": ["post_title"], "transform": "direct" },
    { "targetField": "description", "sourceColumns": ["post_excerpt", "_description_complementaire"], "transform": "concat", "concatSeparator": " — " },
    { "targetField": "unit_price_ht", "sourceColumns": ["regular_price"], "transform": "number" },
    { "targetField": "tax_rate", "sourceColumns": [], "transform": "direct" }
  ],${entityType === 'produits' ? `
  "variantSuggestion": {
    "detected": false,
    "reason": "Tous les noms de produits sont uniques dans l'échantillon",
    "sizeColumn": null,
    "comfortColumn": null,
    "priceColumn": null,
    "purchasePriceColumn": null,
    "skuSupplierColumn": null
  },` : ''}
  "explanation": "Résumé en français : champs mappés, fusions effectuées, champs non trouvés. 2-3 phrases max."
}`

    const anthropicBody = isCorrection
      ? {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: correctionPrompt }],
        }
      : {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: analysisSystemPrompt,
          messages: [{ role: 'user', content: analysisUserPrompt }],
        }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(anthropicBody),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Anthropic ${resp.status}: ${errText.slice(0, 200)}`)
    }

    const aiResult = await resp.json()
    const content: string = aiResult.content?.[0]?.text || ''
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      throw new Error('Réponse IA invalide : ' + cleaned.slice(0, 300))
    }

    // Ensure all target fields are present in mappings
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
