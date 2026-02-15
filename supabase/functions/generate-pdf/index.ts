// ============================================================
// NeoFlow BOS - Edge Function: generate-pdf
// Deploy: supabase functions deploy generate-pdf
// ============================================================
// Input: { document_type: 'invoice' | 'quote', document_id: uuid }
// Output: { pdf_url: string }
//
// This function:
// 1. Reads the document + items from Supabase
// 2. Generates a PDF
// 3. Uploads to Supabase Storage bucket 'pdfs/'
// 4. Returns the public URL
// ============================================================

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
    const { document_type, document_id } = await req.json()

    if (!document_type || !document_id) {
      return new Response(
        JSON.stringify({ error: 'document_type and document_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Load document data
    const table = document_type === 'invoice' ? 'invoices' : 'quotes'
    const itemsTable = document_type === 'invoice' ? 'invoice_items' : 'quote_items'
    const fkColumn = document_type === 'invoice' ? 'invoice_id' : 'quote_id'

    const { data: doc, error: docError } = await supabase
      .from(table)
      .select('*, customers(*), workspaces(*)')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: items } = await supabase
      .from(itemsTable)
      .select('*')
      .eq(fkColumn, document_id)
      .order('position')

    // TODO: Generate PDF using jsPDF or similar library
    // For now, return a placeholder
    // const pdfBytes = generatePdfFromData(doc, items)
    // const fileName = `${document_type}_${document_id}.pdf`
    // const { data: upload } = await supabase.storage.from('pdfs').upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })
    // const { data: { publicUrl } } = supabase.storage.from('pdfs').getPublicUrl(fileName)

    return new Response(
      JSON.stringify({
        pdf_url: null,
        message: 'PDF generation coming soon. Please deploy the full implementation.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
