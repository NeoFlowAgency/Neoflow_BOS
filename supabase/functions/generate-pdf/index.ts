// ============================================================
// NeoFlow BOS - Edge Function: generate-pdf
// Deploy: supabase functions deploy generate-pdf
// ============================================================
// Input: { document_type: 'invoice' | 'quote', document_id: uuid }
// Output: { pdf_url: string }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

import { getCorsHeaders } from '../_shared/cors.ts'

// ─── Constants ───────────────────────────────────────────────
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 45
const CW = PAGE_W - MARGIN * 2 // usable content width = 505.28

const NAVY  = rgb(0.016, 0.027, 0.255)  // #040741
const BLUE  = rgb(0.192, 0.227, 0.875)  // #313ADF
const DARK  = rgb(0.15, 0.15, 0.15)
const GRAY  = rgb(0.45, 0.45, 0.45)
const LGRAY = rgb(0.93, 0.93, 0.95)
const WHITE = rgb(1, 1, 1)
const BLACK = rgb(0, 0, 0)
const GREEN = rgb(0.1, 0.6, 0.2)
const RED   = rgb(0.75, 0.1, 0.1)

// ─── Helpers ─────────────────────────────────────────────────
const safe  = (v: unknown) => (v == null ? '' : String(v))
const fmt   = (n: number | null | undefined) => (n ?? 0).toFixed(2).replace('.', ',') + '\u00a0\u20ac'
const fmtD  = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '\u2026'
}

// ─── Main ─────────────────────────────────────────────────────
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifie' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const userToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifie' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { document_type, document_id } = await req.json()
    if (!document_type || !document_id) {
      return new Response(JSON.stringify({ error: 'document_type and document_id are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const isInvoice = document_type === 'invoice'
    const table      = isInvoice ? 'invoices' : 'quotes'
    const itemsTable = isInvoice ? 'invoice_items' : 'quote_items'
    const fkCol      = isInvoice ? 'invoice_id' : 'quote_id'

    // Load document with customer + workspace info
    const { data: doc, error: docError } = await supabase
      .from(table)
      .select('*, customers(*), workspaces(*)')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: 'Document not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Verify membership
    if (doc.workspace_id) {
      const { data: membership } = await supabase.from('workspace_users').select('id').eq('workspace_id', doc.workspace_id).eq('user_id', user.id).single()
      if (!membership) {
        return new Response(JSON.stringify({ error: 'Acces refuse' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    const { data: items } = await supabase.from(itemsTable).select('*').eq(fkCol, document_id).order('position')

    // ─── Build PDF ──────────────────────────────────────────
    const pdfDoc = await PDFDocument.create()
    const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const ws       = doc.workspaces  || {}
    const customer = doc.customers   || {}

    const docTitle   = isInvoice
      ? (doc.invoice_type === 'avoir' ? 'AVOIR' : doc.invoice_category === 'deposit' ? 'FACTURE D\'ACOMPTE' : 'FACTURE')
      : 'DEVIS'
    const docNumber  = safe(isInvoice ? doc.invoice_number : doc.quote_number)
    const docDate    = fmtD(doc.issue_date  || doc.created_at)
    const dueDate    = fmtD(isInvoice ? doc.due_date : doc.expiry_date)

    const clientName = safe(customer.company_name || customer.full_name)
    const clientAddr = [
      safe(customer.address),
      [safe(customer.postal_code), safe(customer.city)].filter(Boolean).join(' '),
      safe(customer.country && customer.country !== 'France' ? customer.country : ''),
    ].filter(Boolean)

    const wsAddr = [
      safe(ws.address),
      [safe(ws.postal_code), safe(ws.city)].filter(Boolean).join(' '),
    ].filter(Boolean)

    // Fetch logo if available
    let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
    if (ws.logo_url) {
      try {
        const resp = await fetch(ws.logo_url)
        const buf  = await resp.arrayBuffer()
        const ct   = resp.headers.get('content-type') || ''
        if (ct.includes('png')) logoImage = await pdfDoc.embedPng(buf)
        else logoImage = await pdfDoc.embedJpg(buf)
      } catch (_) { /* ignore logo errors */ }
    }

    // ─── Pagination helper ──────────────────────────────────
    // Items: col widths
    const COL = {
      desc:    240,
      qty:      40,
      pu:       80,
      tva:      45,
      total:    80,
      // discount omitted
    }

    // Row height for item lines
    const ROW_H       = 22
    const HEADER_H    = 170  // space before table starts (header block)
    const FOOTER_H    = 120  // space reserved for totals + footer at bottom
    const TABLE_START = HEADER_H
    const TABLE_END   = PAGE_H - FOOTER_H

    function addPage() {
      return pdfDoc.addPage([PAGE_W, PAGE_H])
    }

    // ─── Draw header on first page ──────────────────────────
    const page1 = addPage()
    let page    = page1

    const draw = (p: typeof page1) => ({
      text(text: string, x: number, y: number, size: number, font = fontR, color = DARK) {
        if (!text) return
        p.drawText(text, { x, y: PAGE_H - y, size, font, color })
      },
      rect(x: number, y: number, w: number, h: number, color = LGRAY) {
        p.drawRectangle({ x, y: PAGE_H - y - h, width: w, height: h, color })
      },
      line(x1: number, y1: number, x2: number, y2: number, color = LGRAY, thickness = 0.5) {
        p.drawLine({ start: { x: x1, y: PAGE_H - y1 }, end: { x: x2, y: PAGE_H - y2 }, thickness, color })
      },
    })

    const d1 = draw(page1)

    // Top bar
    d1.rect(0, 0, PAGE_W, 8, BLUE)

    // Logo or company name block (top-left)
    let y = 28
    if (logoImage) {
      const logoW = 90
      const logoH = logoImage.height * (logoW / logoImage.width)
      page1.drawImage(logoImage, { x: MARGIN, y: PAGE_H - y - logoH, width: logoW, height: logoH })
      y += logoH + 8
    } else {
      d1.text(truncate(safe(ws.name), 35), MARGIN, y, 14, fontB, NAVY)
      y += 20
    }

    // Workspace info block (top-right, right-aligned)
    const wsInfoX = PAGE_W - MARGIN
    let wsY = 28
    d1.text(safe(ws.name), wsInfoX - fontB.widthOfTextAtSize(safe(ws.name), 10), wsY, 10, fontB, NAVY)
    wsY += 14
    for (const line of wsAddr) {
      d1.text(line, wsInfoX - fontR.widthOfTextAtSize(line, 8), wsY, 8, fontR, GRAY)
      wsY += 11
    }
    if (ws.phone) {
      d1.text(safe(ws.phone), wsInfoX - fontR.widthOfTextAtSize(safe(ws.phone), 8), wsY, 8, fontR, GRAY)
      wsY += 11
    }
    if (ws.email) {
      d1.text(safe(ws.email), wsInfoX - fontR.widthOfTextAtSize(safe(ws.email), 8), wsY, 8, fontR, GRAY)
      wsY += 11
    }
    if (ws.siret) {
      const siretText = 'SIRET: ' + safe(ws.siret)
      d1.text(siretText, wsInfoX - fontR.widthOfTextAtSize(siretText, 8), wsY, 8, fontR, GRAY)
      wsY += 11
    }
    if (ws.vat_number) {
      const vatText = 'TVA: ' + safe(ws.vat_number)
      d1.text(vatText, wsInfoX - fontR.widthOfTextAtSize(vatText, 8), wsY, 8, fontR, GRAY)
      wsY += 11
    }

    // Document title band
    const titleY = 85
    d1.rect(MARGIN, titleY, CW, 32, NAVY)
    d1.text(docTitle, MARGIN + 12, titleY + 10, 15, fontB, WHITE)
    d1.text('N\u00b0 ' + docNumber, MARGIN + 12, titleY + 23, 9, fontR, rgb(0.7, 0.75, 1))

    // Dates block (top-right of title band)
    const dateLabel1 = 'Date\u00a0:'
    const dateLabel2 = isInvoice ? 'Ech\u00e9ance\u00a0:' : 'Valide jusqu\'au\u00a0:'
    const dateVal1   = docDate
    const dateVal2   = dueDate || (isInvoice ? '' : '30 jours')
    let dtX = PAGE_W - MARGIN - 10
    d1.text(dateVal1, dtX - fontR.widthOfTextAtSize(dateVal1, 8), titleY + 10, 8, fontR, WHITE)
    d1.text(dateLabel1, dtX - fontR.widthOfTextAtSize(dateVal1, 8) - fontB.widthOfTextAtSize(dateLabel1, 8) - 4, titleY + 10, 8, fontB, rgb(0.7, 0.75, 1))
    if (dateVal2) {
      d1.text(dateVal2, dtX - fontR.widthOfTextAtSize(dateVal2, 8), titleY + 23, 8, fontR, WHITE)
      d1.text(dateLabel2, dtX - fontR.widthOfTextAtSize(dateVal2, 8) - fontB.widthOfTextAtSize(dateLabel2, 8) - 4, titleY + 23, 8, fontB, rgb(0.7, 0.75, 1))
    }

    // Customer block
    const cY = 128
    d1.text('DESTINATAIRE', MARGIN, cY, 7, fontB, BLUE)
    d1.line(MARGIN, cY + 10, MARGIN + 180, cY + 10, BLUE, 0.5)
    let cLineY = cY + 18
    if (clientName) {
      d1.text(clientName, MARGIN, cLineY, 10, fontB, DARK); cLineY += 14
    }
    if (customer.full_name && customer.company_name) {
      d1.text(safe(customer.full_name), MARGIN, cLineY, 8.5, fontR, DARK); cLineY += 12
    }
    for (const line of clientAddr) {
      d1.text(line, MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11
    }
    if (customer.email) {
      d1.text(safe(customer.email), MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11
    }
    if (customer.phone) {
      d1.text(safe(customer.phone), MARGIN, cLineY, 8.5, fontR, GRAY)
    }

    // ─── Table header ───────────────────────────────────────
    const tHeaderY = TABLE_START - 28
    d1.rect(MARGIN, tHeaderY, CW, 18, NAVY)

    // Table column X positions
    const colX = {
      desc:  MARGIN + 6,
      qty:   MARGIN + COL.desc + 6,
      pu:    MARGIN + COL.desc + COL.qty + 6,
      tva:   MARGIN + COL.desc + COL.qty + COL.pu + 6,
      total: MARGIN + COL.desc + COL.qty + COL.pu + COL.tva + 6,
    }

    d1.text('Description',    colX.desc,  tHeaderY + 5, 8, fontB, WHITE)
    d1.text('Qte',            colX.qty,   tHeaderY + 5, 8, fontB, WHITE)
    d1.text('PU HT',          colX.pu,    tHeaderY + 5, 8, fontB, WHITE)
    d1.text('TVA',            colX.tva,   tHeaderY + 5, 8, fontB, WHITE)
    d1.text('Total HT',       colX.total, tHeaderY + 5, 8, fontB, WHITE)

    // ─── Table rows (multi-page) ────────────────────────────
    let rowY   = TABLE_START  // current Y from top (absolute)
    let pages  = [page1]
    let drawFns= [d1]
    let curIdx = 0

    function newPage() {
      const np = addPage()
      pages.push(np)
      const nd = draw(np)
      drawFns.push(nd)
      curIdx++
      // Top bar
      nd.rect(0, 0, PAGE_W, 8, BLUE)
      // Table header repeated
      nd.rect(MARGIN, 30, CW, 18, NAVY)
      nd.text('Description', colX.desc,  35, 8, fontB, WHITE)
      nd.text('Qte',         colX.qty,   35, 8, fontB, WHITE)
      nd.text('PU HT',       colX.pu,    35, 8, fontB, WHITE)
      nd.text('TVA',         colX.tva,   35, 8, fontB, WHITE)
      nd.text('Total HT',    colX.total, 35, 8, fontB, WHITE)
      rowY = 55
      return nd
    }

    const rowItems = items || []
    for (let i = 0; i < rowItems.length; i++) {
      // Check if we need a new page
      if (rowY + ROW_H > TABLE_END) {
        newPage()
      }
      const d = drawFns[curIdx]
      const item = rowItems[i]
      const bg = i % 2 === 0 ? WHITE : LGRAY
      d.rect(MARGIN, rowY, CW, ROW_H, bg)

      const qty    = Number(item.quantity    ?? 0)
      const puHT   = Number(item.unit_price_ht ?? 0)
      const tvaRate= Number(item.tax_rate    ?? 20)
      const totHT  = Number(item.total_ht   ?? qty * puHT)

      d.text(truncate(safe(item.description), 52), colX.desc,  rowY + 7, 8.5, fontR, DARK)
      d.text(qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2), colX.qty, rowY + 7, 8.5, fontR, DARK)
      d.text(fmt(puHT),  colX.pu,    rowY + 7, 8.5, fontR, DARK)
      d.text(tvaRate.toFixed(0) + '%', colX.tva, rowY + 7, 8.5, fontR, DARK)
      d.text(fmt(totHT), colX.total, rowY + 7, 8.5, fontR, DARK)

      // Separator line
      d.line(MARGIN, rowY + ROW_H, MARGIN + CW, rowY + ROW_H, LGRAY, 0.3)

      rowY += ROW_H
    }

    // ─── Totals block ────────────────────────────────────────
    // Always on last page
    let totalsNeeded = 95 + (isInvoice && ws.bank_iban ? 40 : 0) + (ws.invoice_footer || ws.quote_footer ? 30 : 0)
    if (rowY + totalsNeeded > PAGE_H - 30) {
      newPage()
    }

    const dLast = drawFns[curIdx]
    const totX  = MARGIN + CW - 170
    let tY = rowY + 12

    const subtotalHT  = Number(doc.subtotal_ht ?? 0)
    const totalTVA    = Number(doc.total_tva   ?? 0)
    const totalTTC    = Number(doc.total_ttc   ?? 0)
    const discountG   = Number(doc.discount_global ?? 0)
    const remainingAmt= Number(doc.remaining_amount ?? 0)

    function drawTotalRow(label: string, value: string, bold = false, color = DARK) {
      const labelFont = bold ? fontB : fontR
      const valueFont = bold ? fontB : fontR
      const size      = bold ? 9.5 : 8.5
      dLast.text(label, totX, tY, size, labelFont, color)
      const vW = valueFont.widthOfTextAtSize(value, size)
      dLast.text(value, MARGIN + CW - vW, tY, size, valueFont, color)
      tY += bold ? 16 : 13
    }

    dLast.line(MARGIN, tY - 4, MARGIN + CW, tY - 4, LGRAY, 0.8)
    tY += 4

    drawTotalRow('Sous-total HT', fmt(subtotalHT))
    if (discountG > 0) {
      drawTotalRow('Remise globale', '-' + fmt(discountG), false, RED)
    }
    drawTotalRow('TVA (' + (totalTVA > 0 && subtotalHT > 0 ? Math.round(totalTVA / subtotalHT * 100) : 20) + '%)', fmt(totalTVA))
    dLast.line(totX, tY - 3, MARGIN + CW, tY - 3, BLUE, 0.7)
    tY += 4
    drawTotalRow('Total TTC', fmt(totalTTC), true, NAVY)

    // Deposit / remaining for quotes
    if (!isInvoice) {
      const depositAmt = Number(doc.deposit_amount ?? 0)
      const depositType = doc.deposit_type
      if (depositAmt > 0) {
        let depositDisplay = ''
        if (depositType === 'percent') {
          depositDisplay = fmt(totalTTC * depositAmt / 100) + ' (' + depositAmt.toFixed(0) + '%)'
        } else {
          depositDisplay = fmt(depositAmt)
        }
        tY += 5
        drawTotalRow('Acompte demande', depositDisplay, false, BLUE)
      }
    }

    // Remaining for invoices
    if (isInvoice && remainingAmt > 0) {
      tY += 5
      drawTotalRow('Reste a payer', fmt(remainingAmt), true, remainingAmt > 0 ? RED : GREEN)
    }

    // Notes
    if (doc.notes) {
      tY += 12
      dLast.text('Notes :', MARGIN, tY, 8, fontB, GRAY)
      tY += 13
      // Wrap notes at ~100 chars
      const notesText = safe(doc.notes)
      const words = notesText.split(' ')
      let line = ''
      for (const word of words) {
        const test = line ? line + ' ' + word : word
        if (fontR.widthOfTextAtSize(test, 8) > CW - 10) {
          dLast.text(line, MARGIN, tY, 8, fontR, GRAY)
          tY += 11
          line = word
        } else {
          line = test
        }
      }
      if (line) { dLast.text(line, MARGIN, tY, 8, fontR, GRAY); tY += 11 }
    }

    // Bank info (invoices only)
    if (isInvoice && (ws.bank_iban || ws.bank_bic)) {
      tY += 14
      dLast.rect(MARGIN, tY - 4, CW, 1, LGRAY)
      tY += 8
      dLast.text('REGLEMENT PAR VIREMENT', MARGIN, tY, 7.5, fontB, NAVY)
      tY += 12
      if (ws.bank_account_holder) {
        dLast.text('Beneficiaire : ' + safe(ws.bank_account_holder), MARGIN, tY, 8, fontR, DARK); tY += 11
      }
      if (ws.bank_iban) {
        dLast.text('IBAN : ' + safe(ws.bank_iban), MARGIN, tY, 8, fontR, DARK); tY += 11
      }
      if (ws.bank_bic) {
        dLast.text('BIC : ' + safe(ws.bank_bic), MARGIN, tY, 8, fontR, DARK); tY += 11
      }
    }

    // ─── Bottom bar + footer ────────────────────────────────
    const footerText = isInvoice ? safe(ws.invoice_footer) : safe(ws.quote_footer)
    const barY = PAGE_H - 35

    // Draw on EVERY page
    for (let pi = 0; pi < pages.length; pi++) {
      const dp = draw(pages[pi])
      dp.rect(0, barY, PAGE_W, 35, NAVY)

      if (footerText) {
        dp.text(truncate(footerText, 110), MARGIN, barY + 8, 7, fontR, rgb(0.7, 0.75, 1))
      }

      // Page number
      const pgLabel = pages.length > 1 ? 'Page ' + (pi + 1) + ' / ' + pages.length : ''
      if (pgLabel) {
        const pgW = fontR.widthOfTextAtSize(pgLabel, 7)
        dp.text(pgLabel, PAGE_W - MARGIN - pgW, barY + 22, 7, fontR, rgb(0.7, 0.75, 1))
      }

      // Doc number reminder on all pages
      const numLabel = docTitle + ' n\u00b0 ' + docNumber
      dp.text(numLabel, MARGIN, barY + 22, 7, fontR, rgb(0.7, 0.75, 1))

      // Legal mention for quotes
      if (!isInvoice && pi === pages.length - 1) {
        const legal = 'Ce devis est valable ' + (doc.expiry_date ? 'jusqu\'au ' + fmtD(doc.expiry_date) : '30 jours') + '. Passe ce delai, il devra etre renouvele.'
        dp.text(truncate(legal, 120), MARGIN, barY + 15, 6.5, fontR, rgb(0.65, 0.7, 0.95))
      }
    }

    // ─── Save & upload ──────────────────────────────────────
    const pdfBytes = await pdfDoc.save()
    const fileName = `${document_type}_${document_id}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from('pdfs').getPublicUrl(fileName)

    return new Response(
      JSON.stringify({ pdf_url: publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error) || 'Erreur inconnue'
    console.error('[generate-pdf] Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
