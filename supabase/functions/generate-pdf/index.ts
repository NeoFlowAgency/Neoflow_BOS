// ============================================================
// NeoFlow BOS - Edge Function: generate-pdf
// Deploy: supabase functions deploy generate-pdf --no-verify-jwt
// ============================================================
// Input:  { document_type: 'invoice'|'quote'|'order'|'delivery_note'|'label', document_id: uuid }
// Output: { pdf_url: "data:application/pdf;base64,..." }
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

import { getCorsHeaders } from '../_shared/cors.ts'

// ─── Page constants ────────────────────────────────────────
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 45
const CW     = PAGE_W - MARGIN * 2  // 505.28

// ─── Colour palette ────────────────────────────────────────
const NAVY  = rgb(0.016, 0.027, 0.255)  // #040741
const BLUE  = rgb(0.192, 0.227, 0.875)  // #313ADF
const DARK  = rgb(0.15,  0.15,  0.15)
const GRAY  = rgb(0.45,  0.45,  0.45)
const LGRAY = rgb(0.93,  0.93,  0.95)
const WHITE = rgb(1,     1,     1)
const RED   = rgb(0.75,  0.1,   0.1)
const GREEN = rgb(0.1,   0.6,   0.2)

// ─── Utility helpers ───────────────────────────────────────
const safe  = (v: unknown) => (v == null ? '' : String(v))
const fmt   = (n: number | null | undefined) => (n ?? 0).toFixed(2).replace('.', ',') + '\u00a0\u20ac'
const fmtD  = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('fr-FR') : ''

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1) + '\u2026'
}

// ─── makeD: unified draw helper (y-from-top coords) ────────
function makeD(page: ReturnType<PDFDocument['addPage']>, fontR: Awaited<ReturnType<PDFDocument['embedFont']>>, fontB: Awaited<ReturnType<PDFDocument['embedFont']>>) {
  return {
    text(text: string, x: number, y: number, size: number, font = fontR, color = DARK) {
      if (!text) return
      page.drawText(text, { x, y: PAGE_H - y, size, font, color })
    },
    textRight(text: string, rightX: number, y: number, size: number, font = fontR, color = DARK) {
      if (!text) return
      const w = font.widthOfTextAtSize(text, size)
      page.drawText(text, { x: rightX - w, y: PAGE_H - y, size, font, color })
    },
    rect(x: number, y: number, w: number, h: number, color = LGRAY) {
      page.drawRectangle({ x, y: PAGE_H - y - h, width: w, height: h, color })
    },
    line(x1: number, y1: number, x2: number, y2: number, color = LGRAY, thickness = 0.5) {
      page.drawLine({ start: { x: x1, y: PAGE_H - y1 }, end: { x: x2, y: PAGE_H - y2 }, thickness, color })
    },
    image(img: Awaited<ReturnType<PDFDocument['embedPng']>>, x: number, y: number, w: number, h: number) {
      page.drawImage(img, { x, y: PAGE_H - y - h, width: w, height: h })
    },
  }
}

// ─── pdfToBase64: save pdf and return data URI ──────────────
async function pdfToBase64(doc: PDFDocument): Promise<string> {
  const bytes = await doc.save()
  // Deno-safe base64 encoding
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i])
  return 'data:application/pdf;base64,' + btoa(binary)
}

// ─── drawCommonHeader: logo/name + workspace info + title band
//     Returns: { tableStart: number }  (y position where table starts)
async function drawCommonHeader(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument['addPage']>,
  fontR: Awaited<ReturnType<PDFDocument['embedFont']>>,
  fontB: Awaited<ReturnType<PDFDocument['embedFont']>>,
  ws: Record<string, unknown>,
  titleText: string,
  docNumber: string,
  docDate: string,
  rightBlockLines: string[],  // lines shown to the right of client block
  logoImage: Awaited<ReturnType<PDFDocument['embedPng']>> | null
): Promise<{ tableStart: number; d: ReturnType<typeof makeD> }> {
  const d = makeD(page, fontR, fontB)

  // Top bar (6pt)
  d.rect(0, 0, PAGE_W, 6, BLUE)

  // ── Logo or workspace name (top-left) ──────────────────
  let logoBottom = 18
  if (logoImage) {
    const maxW = 120, maxH = 60
    const ratio = logoImage.width / logoImage.height
    let lw = maxW, lh = maxW / ratio
    if (lh > maxH) { lh = maxH; lw = maxH * ratio }
    d.image(logoImage, MARGIN, 16, lw, lh)
    logoBottom = 16 + lh + 4
  } else {
    d.text(truncate(safe(ws.name), 35), MARGIN, 22, 14, fontB, NAVY)
    logoBottom = 22 + 18
  }

  // ── Workspace info block (right-aligned) ───────────────
  const wsInfoX = PAGE_W - MARGIN
  let wsY = 16
  const wsName = safe(ws.name)
  d.textRight(wsName, wsInfoX, wsY, 10, fontB, NAVY); wsY += 13

  const wsAddr = [safe(ws.address), [safe(ws.postal_code), safe(ws.city)].filter(Boolean).join(' ')].filter(Boolean)
  for (const ln of wsAddr) { d.textRight(ln, wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
  if (ws.phone) { d.textRight(safe(ws.phone), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
  if (ws.email) { d.textRight(safe(ws.email), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
  if (ws.siret) { d.textRight('SIRET\u00a0: ' + safe(ws.siret), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
  if (ws.vat_number) { d.textRight('TVA\u00a0: ' + safe(ws.vat_number), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }

  const wsInfoBottom = wsY

  // ── Title band ──────────────────────────────────────────
  const titleBandTop = Math.max(logoBottom, wsInfoBottom) + 8
  const TITLE_H = 30
  d.rect(MARGIN, titleBandTop, CW, TITLE_H, NAVY)
  d.text(titleText, MARGIN + 12, titleBandTop + 10, 14, fontB, WHITE)
  d.text('N\u00b0\u00a0' + docNumber, MARGIN + 12, titleBandTop + 23, 8, fontR, rgb(0.7, 0.75, 1))
  d.textRight('Date\u00a0: ' + docDate, PAGE_W - MARGIN - 10, titleBandTop + 16, 8, fontR, WHITE)

  // ── Right meta block (dates/créneau) ────────────────────
  const META_X = MARGIN + CW * 0.55
  let metaY = titleBandTop + TITLE_H + 12
  for (const ln of rightBlockLines) {
    d.text(ln, META_X, metaY, 8, fontR, DARK)
    metaY += 11
  }
  const metaBottom = metaY

  // ── Client block (left) ─────────────────────────────────
  // (drawn by caller after knowing client data; we return clientStartY)
  const clientStartY = titleBandTop + TITLE_H + 12

  // tableStart = max(clientBlock bottom, metaBottom) + 16
  // We return clientStartY so caller can draw client block and track its height
  // For the header alone, reserve minimum space
  const headerOnlyEnd = Math.max(metaBottom, clientStartY) + 4

  return { tableStart: headerOnlyEnd, d }
}

// ─── Main ─────────────────────────────────────────────────
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

    // ══════════════════════════════════════════════════════
    // TYPE: label (étiquettes produits 2×2)
    // ══════════════════════════════════════════════════════
    if (document_type === 'label') {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          id, order_number, workspace_id,
          customer:customers(first_name, last_name),
          items:order_items(
            id, description, quantity,
            product:products(id, name, reference),
            variant:product_variants(id, size, comfort)
          )
        `)
        .eq('id', document_id)
        .single()

      if (orderError || !order) {
        return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404, headers: corsHeaders })
      }

      if ((order as any).workspace_id) {
        const { data: membership } = await supabase.from('workspace_users').select('id').eq('workspace_id', (order as any).workspace_id).eq('user_id', user.id).single()
        if (!membership) {
          return new Response(JSON.stringify({ error: 'Acces refuse' }), { status: 403, headers: corsHeaders })
        }
      }

      const NAVY_LB = rgb(4/255, 7/255, 65/255)
      const BLUE_LB = rgb(49/255, 58/255, 223/255)

      const pdfDoc_lb     = await PDFDocument.create()
      const font_lb       = await pdfDoc_lb.embedFont(StandardFonts.Helvetica)
      const fontBold_lb   = await pdfDoc_lb.embedFont(StandardFonts.HelveticaBold)

      const customer_lb      = (order as any).customer as any
      const customerName_lb  = customer_lb ? `${customer_lb.first_name || ''} ${customer_lb.last_name || ''}`.trim() : ''
      const orderNumber_lb   = (order as any).order_number || ''
      const items_lb         = ((order as any).items || []) as any[]

      const LABEL_W       = 250
      const LABEL_H       = 160
      const COL_POSITIONS = [40, 310]
      const ROW_POSITIONS = [690, 510, 330, 150]

      let page_lb  = pdfDoc_lb.addPage([595.28, 841.89])
      let labelIdx = 0

      const drawLabel = (p: ReturnType<PDFDocument['addPage']>, x: number, y: number, item: any) => {
        p.drawRectangle({ x, y, width: LABEL_W, height: LABEL_H, borderColor: BLUE_LB, borderWidth: 1.5, color: rgb(1, 1, 1) })
        p.drawRectangle({ x, y: y + LABEL_H - 24, width: LABEL_W, height: 24, color: NAVY_LB })
        p.drawText('NEOFLOW BOS', { x: x + 8, y: y + LABEL_H - 17, size: 8, font: fontBold_lb, color: rgb(1, 1, 1) })
        p.drawText(orderNumber_lb, { x: x + LABEL_W - 70, y: y + LABEL_H - 17, size: 8, font: fontBold_lb, color: rgb(0.8, 0.8, 1) })
        const ref = item.product?.reference || ''
        if (ref) p.drawText(ref, { x: x + 8, y: y + LABEL_H - 38, size: 9, font: font_lb, color: rgb(0.5, 0.5, 0.5) })
        const name = item.description || item.product?.name || 'Article'
        p.drawText(name, { x: x + 8, y: y + LABEL_H - 54, size: 11, font: fontBold_lb, color: NAVY_LB, maxWidth: LABEL_W - 16 })
        if (item.variant) {
          const variantLabel = [item.variant.size, item.variant.comfort].filter(Boolean).join(' \u2014 ')
          p.drawText(variantLabel, { x: x + 8, y: y + LABEL_H - 72, size: 12, font: fontBold_lb, color: BLUE_LB })
        }
        p.drawLine({ start: { x: x + 8, y: y + 48 }, end: { x: x + LABEL_W - 8, y: y + 48 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
        p.drawText('CLIENT', { x: x + 8, y: y + 36, size: 7, font: fontBold_lb, color: rgb(0.5, 0.5, 0.5) })
        p.drawText(customerName_lb, { x: x + 8, y: y + 22, size: 10, font: fontBold_lb, color: NAVY_LB, maxWidth: LABEL_W - 16 })
        p.drawText(`QT\u00c9\u00a0: ${item.quantity || 1}`, { x: x + LABEL_W - 55, y: y + 10, size: 9, font: fontBold_lb, color: BLUE_LB })
      }

      for (const item of items_lb) {
        const colIdx = labelIdx % 2
        const rowIdx = Math.floor(labelIdx / 2) % 4
        const x = COL_POSITIONS[colIdx]
        const y = ROW_POSITIONS[rowIdx]
        if (labelIdx > 0 && colIdx === 0 && rowIdx === 0) {
          page_lb = pdfDoc_lb.addPage([595.28, 841.89])
        }
        drawLabel(page_lb, x, y, item)
        labelIdx++
      }

      return new Response(JSON.stringify({ pdf_url: await pdfToBase64(pdfDoc_lb) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ══════════════════════════════════════════════════════
    // SHARED: logo fetch helper
    // ══════════════════════════════════════════════════════
    async function fetchLogo(pdfDoc: PDFDocument, logoUrl: string | null | undefined) {
      if (!logoUrl) return null
      try {
        const resp = await fetch(logoUrl)
        const buf  = await resp.arrayBuffer()
        const ct   = resp.headers.get('content-type') || ''
        return ct.includes('png') ? await pdfDoc.embedPng(buf) : await pdfDoc.embedJpg(buf)
      } catch (_) { return null }
    }

    // ══════════════════════════════════════════════════════
    // SHARED: build full PDF for order / delivery_note / invoice / quote
    // ══════════════════════════════════════════════════════

    // ── Column layout shared by order, invoice, quote ──
    const COL = { desc: 240, qty: 40, pu: 75, tva: 45, total: 75 }
    const ROW_H = 22

    // ── Footer bar (NAVY, 25pt at bottom) on all pages ──
    function drawFooterBar(
      pages: ReturnType<PDFDocument['addPage']>[],
      fontR: Awaited<ReturnType<PDFDocument['embedFont']>>,
      fontB: Awaited<ReturnType<PDFDocument['embedFont']>>,
      line1: string,
      line2: string
    ) {
      const FOOTER_H = 25
      const barY     = PAGE_H - FOOTER_H
      for (let pi = 0; pi < pages.length; pi++) {
        const dp = makeD(pages[pi], fontR, fontB)
        dp.rect(0, barY, PAGE_W, FOOTER_H, NAVY)
        if (line1) dp.text(truncate(line1, 110), MARGIN, barY + 8, 7, fontR, rgb(0.7, 0.75, 1))
        if (line2) dp.text(truncate(line2, 110), MARGIN, barY + 18, 6.5, fontR, rgb(0.65, 0.7, 0.95))
        if (pages.length > 1) {
          const pgLabel = 'Page ' + (pi + 1) + ' / ' + pages.length
          const pgW = fontR.widthOfTextAtSize(pgLabel, 7)
          dp.text(pgLabel, PAGE_W - MARGIN - pgW, barY + 18, 7, fontR, rgb(0.7, 0.75, 1))
        }
      }
    }

    // ── Shared table header row ──
    function drawTableHeader(
      d: ReturnType<typeof makeD>,
      fontB: Awaited<ReturnType<PDFDocument['embedFont']>>,
      y: number,
      cols: typeof COL,
      isDeliveryNote = false
    ) {
      d.rect(MARGIN, y, CW, 18, NAVY)
      const colX = {
        desc:  MARGIN + 6,
        qty:   MARGIN + cols.desc + 6,
        pu:    MARGIN + cols.desc + cols.qty + 6,
        tva:   MARGIN + cols.desc + cols.qty + cols.pu + 6,
        total: MARGIN + cols.desc + cols.qty + cols.pu + cols.tva + 6,
      }
      d.text('D\u00e9signation', colX.desc,  y + 5, 8, fontB, WHITE)
      d.text('Qt\u00e9',         colX.qty,   y + 5, 8, fontB, WHITE)
      d.text(isDeliveryNote ? 'P.U. TTC' : 'P.U. HT', colX.pu, y + 5, 8, fontB, WHITE)
      if (!isDeliveryNote) d.text('TVA', colX.tva, y + 5, 8, fontB, WHITE)
      d.text(isDeliveryNote ? 'Total TTC' : 'Total HT', colX.total, y + 5, 8, fontB, WHITE)
      return colX
    }

    // ══════════════════════════════════════════════════════
    // TYPE: order (bon de commande)
    // ══════════════════════════════════════════════════════
    if (document_type === 'order') {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          workspace:workspaces(*),
          items:order_items(
            *,
            product:products(name, reference, eco_participation_amount),
            variant:product_variants(size, comfort)
          ),
          order_payments(*)
        `)
        .eq('id', document_id)
        .single()

      if (orderError || !order) {
        return new Response(JSON.stringify({ error: 'Commande non trouvee' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      if (order.workspace_id) {
        const { data: membership } = await supabase.from('workspace_users').select('id').eq('workspace_id', order.workspace_id).eq('user_id', user.id).single()
        if (!membership) {
          return new Response(JSON.stringify({ error: 'Acces refuse' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }

      const pdfDoc = await PDFDocument.create()
      const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      const ws         = (order.workspace  || {}) as Record<string, unknown>
      const cust       = (order.customer   || {}) as Record<string, unknown>
      const orderItems = (order.items      || []) as any[]
      const orderNumber = safe(order.order_number || (order.id ? String(order.id).slice(0, 8).toUpperCase() : ''))

      let totalHT  = Number(order.subtotal_ht ?? 0)
      let totalTVA = Number(order.total_tva   ?? 0)
      let totalTTC = Number(order.total_ttc   ?? 0)
      if (!totalTTC && orderItems.length > 0) {
        totalHT  = orderItems.reduce((s: number, i: any) => s + Number(i.total_ht ?? (Number(i.unit_price_ht ?? 0) * Number(i.quantity ?? 0))), 0)
        totalTVA = orderItems.reduce((s: number, i: any) => s + (Number(i.total_ht ?? (Number(i.unit_price_ht ?? 0) * Number(i.quantity ?? 0))) * Number(i.tax_rate ?? 20) / 100), 0)
        totalTTC = totalHT + totalTVA
      }

      const clientAddr = [
        safe(cust.address),
        [safe(cust.postal_code), safe(cust.city)].filter(Boolean).join(' '),
        safe(cust.country && cust.country !== 'France' ? cust.country : ''),
      ].filter(Boolean)

      // Delivery date lines for right meta block
      const deliveryLines: string[] = []
      if (order.wished_delivery_date || order.max_delivery_date) {
        deliveryLines.push('Dates de livraison :')
        if (order.wished_delivery_date) deliveryLines.push('  Souhait\u00e9e : ' + fmtD(order.wished_delivery_date))
        if (order.max_delivery_date)    deliveryLines.push('  Au plus tard : ' + fmtD(order.max_delivery_date))
      }

      const logoImage = await fetchLogo(pdfDoc, ws.logo_url as string)

      // ── Page 1 ──
      const page1 = pdfDoc.addPage([PAGE_W, PAGE_H])
      const d1    = makeD(page1, fontR, fontB)

      // ── Top bar ──
      d1.rect(0, 0, PAGE_W, 6, BLUE)

      // ── Logo or workspace name ──
      let logoBottom = 18
      if (logoImage) {
        const maxW = 120, maxH = 60
        const ratio = logoImage.width / logoImage.height
        let lw = maxW, lh = maxW / ratio
        if (lh > maxH) { lh = maxH; lw = maxH * ratio }
        d1.image(logoImage, MARGIN, 16, lw, lh)
        logoBottom = 16 + lh + 4
      } else {
        d1.text(truncate(safe(ws.name), 35), MARGIN, 22, 14, fontB, NAVY)
        logoBottom = 22 + 18
      }

      // ── Workspace info (right) ──
      const wsInfoX = PAGE_W - MARGIN
      let wsY = 16
      d1.textRight(safe(ws.name), wsInfoX, wsY, 10, fontB, NAVY); wsY += 13
      const wsAddr = [safe(ws.address), [safe(ws.postal_code), safe(ws.city)].filter(Boolean).join(' ')].filter(Boolean)
      for (const ln of wsAddr) { d1.textRight(ln, wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      if (ws.phone) { d1.textRight(safe(ws.phone), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      if (ws.email) { d1.textRight(safe(ws.email), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      if (ws.siret) { d1.textRight('SIRET\u00a0: ' + safe(ws.siret), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      const wsInfoBottom = wsY

      // ── Title band ──
      const titleBandTop = Math.max(logoBottom, wsInfoBottom) + 8
      const TITLE_H = 30
      d1.rect(MARGIN, titleBandTop, CW, TITLE_H, NAVY)
      d1.text('BON DE COMMANDE', MARGIN + 12, titleBandTop + 10, 14, fontB, WHITE)
      d1.text('N\u00b0\u00a0' + orderNumber, MARGIN + 12, titleBandTop + 23, 8, fontR, rgb(0.7, 0.75, 1))
      d1.textRight('Date\u00a0: ' + fmtD(order.created_at), PAGE_W - MARGIN - 10, titleBandTop + 18, 8, fontR, WHITE)

      // ── Below title: client block (left) + delivery meta (right) ──
      const blockTop = titleBandTop + TITLE_H + 12
      const META_X   = MARGIN + CW * 0.55

      // Client block
      d1.text('CLIENT', MARGIN, blockTop, 7, fontB, BLUE)
      d1.line(MARGIN, blockTop + 10, MARGIN + 180, blockTop + 10, BLUE, 0.5)
      let cLineY = blockTop + 18
      const clientName = safe(cust.company_name || cust.full_name)
      if (clientName) { d1.text(clientName, MARGIN, cLineY, 10, fontB, DARK); cLineY += 14 }
      if (cust.full_name && cust.company_name) { d1.text(safe(cust.full_name), MARGIN, cLineY, 8.5, fontR, DARK); cLineY += 12 }
      for (const ln of clientAddr) { d1.text(ln, MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11 }
      if (cust.phone) { d1.text(safe(cust.phone), MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11 }
      if (cust.email) { d1.text(safe(cust.email), MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11 }
      const clientBottom = cLineY + 4

      // Delivery meta block (right)
      let metaY = blockTop
      if (deliveryLines.length > 0) {
        d1.text(deliveryLines[0], META_X, metaY, 8, fontB, NAVY); metaY += 13
        for (let i = 1; i < deliveryLines.length; i++) {
          d1.text(deliveryLines[i], META_X, metaY, 8, fontR, DARK); metaY += 11
        }
      }
      const metaBottom = metaY + 4

      // ── Table starts after header content ──
      const TABLE_START = Math.max(clientBottom, metaBottom) + 16
      const TABLE_END   = PAGE_H - 30

      // ── Table header ──
      const colX = drawTableHeader(d1, fontB, TABLE_START - 18, COL)

      // ── Table rows (multi-page) ──
      let rowY   = TABLE_START
      const pages: ReturnType<PDFDocument['addPage']>[]          = [page1]
      const drawFns: ReturnType<typeof makeD>[] = [d1]
      let curIdx = 0

      function newOrderPage() {
        const np = pdfDoc.addPage([PAGE_W, PAGE_H])
        pages.push(np)
        const nd = makeD(np, fontR, fontB)
        drawFns.push(nd)
        curIdx++
        nd.rect(0, 0, PAGE_W, 6, BLUE)
        drawTableHeader(nd, fontB, 30, COL)
        rowY = 55
        return nd
      }

      for (let i = 0; i < orderItems.length; i++) {
        const item    = orderItems[i]
        const qty     = Number(item.quantity      ?? 0)
        const puHT    = Number(item.unit_price_ht ?? 0)
        const tvaRate = Number(item.tax_rate      ?? 20)
        const totHT   = Number(item.total_ht      ?? qty * puHT)
        const eco     = Number(item.eco_participation ?? 0)
        const rowH    = ROW_H + (eco > 0 ? 14 : 0)

        if (rowY + rowH > TABLE_END) newOrderPage()
        const d = drawFns[curIdx]
        d.rect(MARGIN, rowY, CW, rowH, i % 2 === 0 ? WHITE : LGRAY)

        let desc = safe(item.product?.name || item.description)
        if (item.variant) {
          const vp: string[] = []
          if (item.variant.size)    vp.push(safe(item.variant.size))
          if (item.variant.comfort) vp.push(safe(item.variant.comfort))
          if (vp.length) desc += ' (' + vp.join(' - ') + ')'
        }
        d.text(truncate(desc, 52),                                     colX.desc,  rowY + 7, 8.5, fontR, DARK)
        d.text(qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2),        colX.qty,   rowY + 7, 8.5, fontR, DARK)
        d.text(fmt(puHT),                                               colX.pu,    rowY + 7, 8.5, fontR, DARK)
        d.text(tvaRate.toFixed(0) + '%',                                colX.tva,   rowY + 7, 8.5, fontR, DARK)
        d.text(fmt(totHT),                                              colX.total, rowY + 7, 8.5, fontR, DARK)
        if (eco > 0) d.text('dont \u00e9co-participation DEA : ' + fmt(eco) + ' TTC', colX.desc + 10, rowY + ROW_H - 3, 7, fontR, GRAY)
        d.line(MARGIN, rowY + rowH, MARGIN + CW, rowY + rowH, LGRAY, 0.3)
        rowY += rowH
      }

      // ── Totals ──
      const acomptes     = ((order.order_payments || []) as any[]).filter((p: any) => p.payment_type === 'acompte')
      const totalsNeeded = 95 + (acomptes.length > 0 ? 20 + acomptes.length * 11 + 20 : 0) + (order.old_furniture_option && order.old_furniture_option !== 'keep' ? 35 : 0) + 60
      if (rowY + totalsNeeded > TABLE_END) newOrderPage()

      const dLast = drawFns[curIdx]
      const totX  = MARGIN + CW - 170
      let tY = rowY + 12

      function drawTotalRow(label: string, value: string, bold = false, color = DARK) {
        const lf   = bold ? fontB : fontR
        const size = bold ? 9.5 : 8.5
        dLast.text(label, totX, tY, size, lf, color)
        const vW = (bold ? fontB : fontR).widthOfTextAtSize(value, size)
        dLast.text(value, MARGIN + CW - vW, tY, size, bold ? fontB : fontR, color)
        tY += bold ? 16 : 13
      }

      dLast.line(MARGIN, tY - 4, MARGIN + CW, tY - 4, LGRAY, 0.8); tY += 4
      drawTotalRow('Sous-total HT', fmt(totalHT))
      drawTotalRow('TVA\u00a0(' + (totalTVA > 0 && totalHT > 0 ? Math.round(totalTVA / totalHT * 100) : 20) + '%)', fmt(totalTVA))
      dLast.line(totX, tY - 3, MARGIN + CW, tY - 3, BLUE, 0.7); tY += 4
      drawTotalRow('Total TTC', fmt(totalTTC), true, NAVY)

      // Acomptes
      if (acomptes.length > 0) {
        tY += 10
        dLast.text('Acompte encaiss\u00e9', MARGIN, tY, 8, fontB, NAVY); tY += 12
        const modeLabels: Record<string, string> = { cb: 'CB', cash: 'Esp\u00e8ces', cheque: 'Ch\u00e8que', virement: 'Virement', financement: 'Financement' }
        let totalAcompte = 0
        for (const p of acomptes) {
          const label  = modeLabels[p.mode] || safe(p.mode)
          const amount = Number(p.amount ?? 0)
          totalAcompte += amount
          dLast.text(label + '\u00a0:', MARGIN + 10, tY, 8, fontR, DARK)
          dLast.text(fmt(amount), MARGIN + 120, tY, 8, fontR, DARK)
          tY += 11
        }
        const solde = Math.max(0, Number(order.total_ttc ?? totalTTC) - totalAcompte)
        if (solde > 0) {
          tY += 4
          dLast.text('\u00c0 encaisser \u00e0 la livraison\u00a0:', MARGIN + 10, tY, 8.5, fontB, NAVY)
          dLast.text(fmt(solde), MARGIN + 195, tY, 8.5, fontB, NAVY)
          tY += 14
        }
      }

      // Old furniture
      const repriseLabels: Record<string, string> = {
        keep: 'Conserver ses anciens meubles', ess: 'Don \u00e0 une ESS',
        dechetterie: 'D\u00e9chetterie / point de collecte', reprise: 'Reprise gratuite par le magasin',
      }
      if (order.old_furniture_option && order.old_furniture_option !== 'keep') {
        tY += 10
        dLast.text('Reprise des anciens meubles\u00a0:', MARGIN, tY, 8, fontB, GRAY); tY += 11
        dLast.text('[x]\u00a0' + (repriseLabels[order.old_furniture_option] || safe(order.old_furniture_option)), MARGIN + 10, tY, 8, fontR, DARK)
        tY += 14
      }

      // Signatures
      tY += 20
      dLast.line(MARGIN, tY, MARGIN + 160, tY, LGRAY, 0.5)
      dLast.line(PAGE_W - MARGIN - 160, tY, PAGE_W - MARGIN, tY, LGRAY, 0.5)
      tY += 12
      dLast.text('Signature client', MARGIN, tY, 7.5, fontR, GRAY)
      dLast.text('Signature conseiller', PAGE_W - MARGIN - 90, tY, 7.5, fontR, GRAY)
      tY += 10
      dLast.text('Lu et approuv\u00e9', MARGIN, tY, 7, fontR, GRAY)

      // Footer bar
      const legalInfo = [
        ws.siret         ? 'SIRET ' + safe(ws.siret) : '',
        ws.ape_code      ? 'APE '   + safe(ws.ape_code) : '',
        ws.legal_capital ? 'Capital ' + safe(ws.legal_capital) : '',
      ].filter(Boolean).join(' - ')
      drawFooterBar(pages, fontR, fontB, 'Bon de commande n\u00b0 ' + orderNumber, legalInfo)

      return new Response(JSON.stringify({ pdf_url: await pdfToBase64(pdfDoc) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ══════════════════════════════════════════════════════
    // TYPE: delivery_note (bon de livraison)
    // ══════════════════════════════════════════════════════
    if (document_type === 'delivery_note') {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, created_at,
          total_ttc, amount_paid, remaining_amount,
          old_furniture_option, delivered_at,
          wished_delivery_date, max_delivery_date,
          workspace_id,
          customer:customers(first_name, last_name, full_name, company_name, phone, address, city, postal_code),
          items:order_items(
            id, description, quantity, unit_price_ht, tax_rate, total_ht,
            eco_participation,
            product:products(id, name, reference),
            variant:product_variants(id, size, comfort)
          ),
          order_payments(id, payment_type, mode, amount),
          workspace:workspaces(
            name, address, city, postal_code, phone, email, siret, ape_code, legal_capital,
            logo_url, vat_number
          )
        `)
        .eq('id', document_id)
        .single()

      if (orderError || !order) {
        return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404, headers: corsHeaders })
      }

      if ((order as any).workspace_id) {
        const { data: membership } = await supabase.from('workspace_users').select('id').eq('workspace_id', (order as any).workspace_id).eq('user_id', user.id).single()
        if (!membership) {
          return new Response(JSON.stringify({ error: 'Acces refuse' }), { status: 403, headers: corsHeaders })
        }
      }

      const { data: delivery } = await supabase
        .from('deliveries')
        .select('id, scheduled_date, time_slot, assigned_to, delivery_address, notes')
        .eq('order_id', document_id)
        .not('status', 'eq', 'annulee')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const ws_dn       = ((order as any).workspace || {}) as Record<string, unknown>
      const customer_dn = ((order as any).customer  || {}) as Record<string, unknown>
      const payments_dn = ((order as any).order_payments || []) as any[]
      const items_dn    = ((order as any).items          || []) as any[]
      const orderNumber_dn = safe((order as any).order_number)

      const totalAcompte_dn = payments_dn.filter((p: any) => p.payment_type === 'acompte').reduce((s: number, p: any) => s + Number(p.amount), 0)
      const soldeRestant_dn = Math.max(0, Number((order as any).total_ttc || 0) - totalAcompte_dn)

      const pdfDoc = await PDFDocument.create()
      const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      const logoImage = await fetchLogo(pdfDoc, ws_dn.logo_url as string)

      const page1 = pdfDoc.addPage([PAGE_W, PAGE_H])
      const d1    = makeD(page1, fontR, fontB)

      // ── Top bar ──
      d1.rect(0, 0, PAGE_W, 6, BLUE)

      // ── Logo or workspace name ──
      let logoBottom = 18
      if (logoImage) {
        const maxW = 120, maxH = 60
        const ratio = logoImage.width / logoImage.height
        let lw = maxW, lh = maxW / ratio
        if (lh > maxH) { lh = maxH; lw = maxH * ratio }
        d1.image(logoImage, MARGIN, 16, lw, lh)
        logoBottom = 16 + lh + 4
      } else {
        d1.text(truncate(safe(ws_dn.name), 35), MARGIN, 22, 14, fontB, NAVY)
        logoBottom = 22 + 18
      }

      // ── Workspace info (right) ──
      const wsInfoX = PAGE_W - MARGIN
      let wsY = 16
      d1.textRight(safe(ws_dn.name), wsInfoX, wsY, 10, fontB, NAVY); wsY += 13
      const wsAddr_dn = [safe(ws_dn.address), [safe(ws_dn.postal_code), safe(ws_dn.city)].filter(Boolean).join(' ')].filter(Boolean)
      for (const ln of wsAddr_dn) { d1.textRight(ln, wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      if (ws_dn.phone) { d1.textRight(safe(ws_dn.phone), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      if (ws_dn.email) { d1.textRight(safe(ws_dn.email), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      if (ws_dn.siret) { d1.textRight('SIRET\u00a0: ' + safe(ws_dn.siret), wsInfoX, wsY, 8, fontR, GRAY); wsY += 11 }
      const wsInfoBottom = wsY

      // ── Title band ──
      const titleBandTop = Math.max(logoBottom, wsInfoBottom) + 8
      const TITLE_H = 30
      d1.rect(MARGIN, titleBandTop, CW, TITLE_H, NAVY)
      d1.text('BON DE LIVRAISON', MARGIN + 12, titleBandTop + 10, 14, fontB, WHITE)
      d1.text('N\u00b0\u00a0' + orderNumber_dn, MARGIN + 12, titleBandTop + 23, 8, fontR, rgb(0.7, 0.75, 1))
      const dateStr_dn = (delivery as any)?.scheduled_date
        ? new Date((delivery as any).scheduled_date).toLocaleDateString('fr-FR')
        : fmtD((order as any).created_at)
      d1.textRight('Date\u00a0: ' + dateStr_dn, PAGE_W - MARGIN - 10, titleBandTop + 18, 8, fontR, WHITE)

      // ── Below title: client block (left) + créneau block (right) ──
      const blockTop = titleBandTop + TITLE_H + 12
      const META_X   = MARGIN + CW * 0.55

      // Customer block (left)
      const customerName_dn = safe(customer_dn.company_name || customer_dn.full_name || [customer_dn.first_name, customer_dn.last_name].filter(Boolean).join(' '))
      d1.text('CLIENT', MARGIN, blockTop, 7, fontB, BLUE)
      d1.line(MARGIN, blockTop + 10, MARGIN + 180, blockTop + 10, BLUE, 0.5)
      let cLineY_dn = blockTop + 18
      if (customerName_dn) { d1.text(customerName_dn, MARGIN, cLineY_dn, 10, fontB, DARK); cLineY_dn += 14 }
      const addr_dn_str = ((delivery as any)?.delivery_address) || [customer_dn.address, [customer_dn.postal_code, customer_dn.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      if (addr_dn_str) { d1.text(truncate(addr_dn_str, 55), MARGIN, cLineY_dn, 8.5, fontR, GRAY); cLineY_dn += 11 }
      if (customer_dn.phone) { d1.text(safe(customer_dn.phone), MARGIN, cLineY_dn, 8.5, fontR, GRAY); cLineY_dn += 11 }
      const clientBottom_dn = cLineY_dn + 4

      // Créneau block (right)
      let metaY_dn = blockTop
      if ((delivery as any)?.scheduled_date || (delivery as any)?.time_slot) {
        d1.text('CR\u00c9NEAU DE LIVRAISON', META_X, metaY_dn, 7, fontB, BLUE); metaY_dn += 13
        if ((delivery as any)?.scheduled_date) {
          const fullDate = new Date((delivery as any).scheduled_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          d1.text(fullDate, META_X, metaY_dn, 8, fontB, NAVY); metaY_dn += 13
        }
        if ((delivery as any)?.time_slot) {
          d1.text(safe((delivery as any).time_slot), META_X, metaY_dn, 12, fontB, BLUE); metaY_dn += 16
        }
      }
      const metaBottom_dn = metaY_dn + 4

      // ── Table starts dynamically ──
      const DN_COLS = { desc: 300, qty: 50, pu: 80, tva: 0, total: 75 }
      const TABLE_START_DN = Math.max(clientBottom_dn, metaBottom_dn) + 16
      const TABLE_END_DN   = PAGE_H - 30

      const colX_dn = drawTableHeader(d1, fontB, TABLE_START_DN - 18, DN_COLS, true)

      let rowY_dn   = TABLE_START_DN
      const pages   = [page1]
      const drawFns = [d1]
      let curIdx    = 0

      function newDnPage() {
        const np = pdfDoc.addPage([PAGE_W, PAGE_H])
        pages.push(np)
        const nd = makeD(np, fontR, fontB)
        drawFns.push(nd)
        curIdx++
        nd.rect(0, 0, PAGE_W, 6, BLUE)
        drawTableHeader(nd, fontB, 30, DN_COLS, true)
        rowY_dn = 55
        return nd
      }

      for (let i = 0; i < items_dn.length; i++) {
        const item    = items_dn[i]
        const qty     = Number(item.quantity     || 0)
        const puHT    = Number(item.unit_price_ht || 0)
        const tvaRate = Number(item.tax_rate     || 20)
        const ttcUnit = puHT * (1 + tvaRate / 100)
        const ttcTot  = ttcUnit * qty
        const eco     = Number(item.eco_participation || 0)
        const rowH    = ROW_H + (eco > 0 ? 14 : 0)

        if (rowY_dn + rowH > TABLE_END_DN) newDnPage()
        const d = drawFns[curIdx]
        d.rect(MARGIN, rowY_dn, CW, rowH, i % 2 === 0 ? WHITE : LGRAY)

        let desc = safe(item.description || item.product?.name || 'Article')
        if (item.variant) {
          const vp: string[] = [item.variant.size, item.variant.comfort].filter(Boolean)
          if (vp.length) desc += ' \u2014 ' + vp.join(' ')
        }
        d.text(truncate(desc, 60),                               colX_dn.desc,  rowY_dn + 7, 8.5, fontB, DARK)
        d.text(String(qty),                                      colX_dn.qty,   rowY_dn + 7, 8.5, fontR, DARK)
        d.text(fmt(ttcUnit),                                     colX_dn.pu,    rowY_dn + 7, 8.5, fontR, DARK)
        d.text(fmt(ttcTot),                                      colX_dn.total, rowY_dn + 7, 8.5, fontR, DARK)
        if (eco > 0) d.text('\u00c9co-participation DEA\u00a0: ' + fmt(eco), colX_dn.desc + 10, rowY_dn + ROW_H - 3, 7, fontR, GRAY)
        d.line(MARGIN, rowY_dn + rowH, MARGIN + CW, rowY_dn + rowH, LGRAY, 0.3)
        rowY_dn += rowH
      }

      // ── Totals ──
      const dLast_dn = drawFns[curIdx]
      let tY_dn      = rowY_dn + 16

      const totalTTC_dn = Number((order as any).total_ttc || 0)
      const totX_dn     = MARGIN + CW - 175

      dLast_dn.line(MARGIN, tY_dn - 4, MARGIN + CW, tY_dn - 4, LGRAY, 0.8); tY_dn += 4

      function dnTotRow(label: string, value: string, bold = false, color = DARK) {
        const lf   = bold ? fontB : fontR
        const size = bold ? 9.5 : 8.5
        dLast_dn.text(label, totX_dn, tY_dn, size, lf, color)
        const vW = (bold ? fontB : fontR).widthOfTextAtSize(value, size)
        dLast_dn.text(value, MARGIN + CW - vW, tY_dn, size, bold ? fontB : fontR, color)
        tY_dn += bold ? 16 : 13
      }

      dnTotRow('Total TTC', fmt(totalTTC_dn))
      if (totalAcompte_dn > 0) dnTotRow('Acompte vers\u00e9', '-\u00a0' + fmt(totalAcompte_dn), false, GRAY)
      dLast_dn.line(totX_dn, tY_dn - 3, MARGIN + CW, tY_dn - 3, BLUE, 0.7); tY_dn += 6

      // Solde à encaisser — box visible
      dLast_dn.rect(totX_dn - 10, tY_dn - 4, MARGIN + CW - totX_dn + 10, 26, LGRAY)
      dLast_dn.text('SOLDE \u00c0 ENCAISSER', totX_dn, tY_dn + 4, 8.5, fontB, NAVY)
      const soldeStr = fmt(soldeRestant_dn)
      const soldeW   = fontB.widthOfTextAtSize(soldeStr, 13)
      dLast_dn.text(soldeStr, MARGIN + CW - soldeW, tY_dn + 4, 13, fontB, BLUE)
      tY_dn += 32

      // Old furniture
      const OLD_LABELS_DN: Record<string, string> = {
        keep: 'Client conserve ses anciens meubles', ess: 'Don ESS (association)',
        dechetterie: 'D\u00e9chetterie / point de collecte', reprise: 'Reprise gratuite par le magasin',
      }
      if ((order as any).old_furniture_option) {
        dLast_dn.rect(MARGIN, tY_dn - 4, CW, 26, LGRAY)
        dLast_dn.text('REPRISE ANCIENS MEUBLES\u00a0:', MARGIN + 8, tY_dn + 6, 9, fontB, NAVY)
        dLast_dn.text(OLD_LABELS_DN[(order as any).old_furniture_option] || (order as any).old_furniture_option, MARGIN + 175, tY_dn + 6, 9, fontR, NAVY)
        tY_dn += 36
      }

      // Signatures
      tY_dn += 10
      dLast_dn.line(MARGIN, tY_dn, MARGIN + 170, tY_dn, LGRAY, 0.5)
      dLast_dn.line(PAGE_W - MARGIN - 200, tY_dn, PAGE_W - MARGIN, tY_dn, LGRAY, 0.5)
      tY_dn += 12
      dLast_dn.text('Signature livreur', MARGIN, tY_dn, 7.5, fontR, GRAY)
      dLast_dn.text('Signature client (bon pour accord)', PAGE_W - MARGIN - 200, tY_dn, 7.5, fontR, GRAY)

      // Footer bar
      const legalInfo_dn = [ws_dn.siret ? 'SIRET\u00a0: ' + safe(ws_dn.siret) : '', ws_dn.ape_code ? 'APE\u00a0: ' + safe(ws_dn.ape_code) : '', ws_dn.legal_capital ? 'Capital\u00a0: ' + safe(ws_dn.legal_capital) : ''].filter(Boolean).join(' \u00b7 ')
      drawFooterBar(pages, fontR, fontB, 'Bon de livraison n\u00b0 ' + orderNumber_dn, legalInfo_dn)

      return new Response(JSON.stringify({ pdf_url: await pdfToBase64(pdfDoc) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ══════════════════════════════════════════════════════
    // TYPE: invoice | quote
    // ══════════════════════════════════════════════════════
    const isInvoice  = document_type === 'invoice'
    const table      = isInvoice ? 'invoices' : 'quotes'
    const itemsTable = isInvoice ? 'invoice_items' : 'quote_items'
    const fkCol      = isInvoice ? 'invoice_id' : 'quote_id'

    const { data: doc, error: docError } = await supabase
      .from(table)
      .select('*, customers(*), workspaces(*)')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: 'Document not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (doc.workspace_id) {
      const { data: membership } = await supabase.from('workspace_users').select('id').eq('workspace_id', doc.workspace_id).eq('user_id', user.id).single()
      if (!membership) {
        return new Response(JSON.stringify({ error: 'Acces refuse' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    const { data: items } = await supabase.from(itemsTable).select('*').eq(fkCol, document_id).order('position')

    const pdfDoc = await PDFDocument.create()
    const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const ws       = (doc.workspaces || {}) as Record<string, unknown>
    const customer = (doc.customers  || {}) as Record<string, unknown>

    const docTitle  = isInvoice
      ? (doc.invoice_type === 'avoir' ? 'AVOIR' : doc.invoice_category === 'deposit' ? 'FACTURE D\'ACOMPTE' : 'FACTURE')
      : 'DEVIS'
    const docNumber = safe(isInvoice ? doc.invoice_number : doc.quote_number)
    const docDate   = fmtD(doc.issue_date || doc.created_at)
    const dueDate   = fmtD(isInvoice ? doc.due_date : doc.expiry_date)

    const clientName = safe(customer.company_name || customer.full_name)
    const clientAddr = [
      safe(customer.address),
      [safe(customer.postal_code), safe(customer.city)].filter(Boolean).join(' '),
      safe(customer.country && customer.country !== 'France' ? customer.country : ''),
    ].filter(Boolean)

    const logoImage = await fetchLogo(pdfDoc, ws.logo_url as string)

    // ── Page 1 ──
    const page1 = pdfDoc.addPage([PAGE_W, PAGE_H])
    const d1    = makeD(page1, fontR, fontB)

    // ── Top bar ──
    d1.rect(0, 0, PAGE_W, 6, BLUE)

    // ── Logo or workspace name ──
    let logoBottom = 18
    if (logoImage) {
      const maxW = 120, maxH = 60
      const ratio = logoImage.width / logoImage.height
      let lw = maxW, lh = maxW / ratio
      if (lh > maxH) { lh = maxH; lw = maxH * ratio }
      d1.image(logoImage, MARGIN, 16, lw, lh)
      logoBottom = 16 + lh + 4
    } else {
      d1.text(truncate(safe(ws.name), 35), MARGIN, 22, 14, fontB, NAVY)
      logoBottom = 22 + 18
    }

    // ── Workspace info (right) ──
    const wsInfoX_iq = PAGE_W - MARGIN
    let wsY_iq = 16
    d1.textRight(safe(ws.name), wsInfoX_iq, wsY_iq, 10, fontB, NAVY); wsY_iq += 13
    const wsAddr_iq = [safe(ws.address), [safe(ws.postal_code), safe(ws.city)].filter(Boolean).join(' ')].filter(Boolean)
    for (const ln of wsAddr_iq) { d1.textRight(ln, wsInfoX_iq, wsY_iq, 8, fontR, GRAY); wsY_iq += 11 }
    if (ws.phone) { d1.textRight(safe(ws.phone), wsInfoX_iq, wsY_iq, 8, fontR, GRAY); wsY_iq += 11 }
    if (ws.email) { d1.textRight(safe(ws.email), wsInfoX_iq, wsY_iq, 8, fontR, GRAY); wsY_iq += 11 }
    if (ws.siret) { d1.textRight('SIRET\u00a0: ' + safe(ws.siret), wsInfoX_iq, wsY_iq, 8, fontR, GRAY); wsY_iq += 11 }
    if (ws.vat_number) { d1.textRight('TVA\u00a0: ' + safe(ws.vat_number), wsInfoX_iq, wsY_iq, 8, fontR, GRAY); wsY_iq += 11 }
    const wsInfoBottom_iq = wsY_iq

    // ── Title band ──
    const titleBandTop = Math.max(logoBottom, wsInfoBottom_iq) + 8
    const TITLE_H = 30
    d1.rect(MARGIN, titleBandTop, CW, TITLE_H, NAVY)
    d1.text(docTitle, MARGIN + 12, titleBandTop + 10, 14, fontB, WHITE)
    d1.text('N\u00b0\u00a0' + docNumber, MARGIN + 12, titleBandTop + 23, 8, fontR, rgb(0.7, 0.75, 1))

    // Dates in title band (right)
    const dateLabel2 = isInvoice ? '\u00c9ch\u00e9ance\u00a0:' : 'Valide jusqu\'au\u00a0:'
    const dateVal2   = dueDate || (isInvoice ? '' : '30 jours')
    d1.textRight('Date\u00a0: ' + docDate, PAGE_W - MARGIN - 10, titleBandTop + 10, 8, fontR, WHITE)
    if (dateVal2) d1.textRight(dateLabel2 + ' ' + dateVal2, PAGE_W - MARGIN - 10, titleBandTop + 23, 8, fontR, rgb(0.8, 0.85, 1))

    // ── Below title: client block (left) + meta right ──
    const blockTop_iq = titleBandTop + TITLE_H + 12

    // Client block (left)
    d1.text('DESTINATAIRE', MARGIN, blockTop_iq, 7, fontB, BLUE)
    d1.line(MARGIN, blockTop_iq + 10, MARGIN + 180, blockTop_iq + 10, BLUE, 0.5)
    let cLineY_iq = blockTop_iq + 18
    if (clientName) { d1.text(clientName, MARGIN, cLineY_iq, 10, fontB, DARK); cLineY_iq += 14 }
    if (customer.full_name && customer.company_name) { d1.text(safe(customer.full_name), MARGIN, cLineY_iq, 8.5, fontR, DARK); cLineY_iq += 12 }
    for (const ln of clientAddr) { d1.text(ln, MARGIN, cLineY_iq, 8.5, fontR, GRAY); cLineY_iq += 11 }
    if (customer.email) { d1.text(safe(customer.email), MARGIN, cLineY_iq, 8.5, fontR, GRAY); cLineY_iq += 11 }
    if (customer.phone) { d1.text(safe(customer.phone), MARGIN, cLineY_iq, 8.5, fontR, GRAY); cLineY_iq += 11 }
    const clientBottom_iq = cLineY_iq + 4

    // Right block: doc meta (référence, order_id…)
    const metaBottom_iq = blockTop_iq + 4  // nothing extra on right for invoice/quote

    // ── Table starts dynamically ──
    const TABLE_START_IQ = Math.max(clientBottom_iq, metaBottom_iq) + 16
    const TABLE_END_IQ   = PAGE_H - 30

    const colX_iq = drawTableHeader(d1, fontB, TABLE_START_IQ - 18, COL)

    let rowY_iq  = TABLE_START_IQ
    const pages  = [page1]
    const drawFns= [d1]
    let curIdx   = 0

    function newIqPage() {
      const np = pdfDoc.addPage([PAGE_W, PAGE_H])
      pages.push(np)
      const nd = makeD(np, fontR, fontB)
      drawFns.push(nd)
      curIdx++
      nd.rect(0, 0, PAGE_W, 6, BLUE)
      drawTableHeader(nd, fontB, 30, COL)
      rowY_iq = 55
      return nd
    }

    const rowItems = items || []
    for (let i = 0; i < rowItems.length; i++) {
      if (rowY_iq + ROW_H > TABLE_END_IQ) newIqPage()
      const d    = drawFns[curIdx]
      const item = rowItems[i]
      d.rect(MARGIN, rowY_iq, CW, ROW_H, i % 2 === 0 ? WHITE : LGRAY)

      const qty     = Number(item.quantity      ?? 0)
      const puHT    = Number(item.unit_price_ht ?? 0)
      const tvaRate = Number(item.tax_rate      ?? 20)
      const totHT   = Number(item.total_ht      ?? qty * puHT)

      d.text(truncate(safe(item.description), 52), colX_iq.desc,  rowY_iq + 7, 8.5, fontR, DARK)
      d.text(qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2), colX_iq.qty, rowY_iq + 7, 8.5, fontR, DARK)
      d.text(fmt(puHT),                                         colX_iq.pu,    rowY_iq + 7, 8.5, fontR, DARK)
      d.text(tvaRate.toFixed(0) + '%',                          colX_iq.tva,   rowY_iq + 7, 8.5, fontR, DARK)
      d.text(fmt(totHT),                                        colX_iq.total, rowY_iq + 7, 8.5, fontR, DARK)
      d.line(MARGIN, rowY_iq + ROW_H, MARGIN + CW, rowY_iq + ROW_H, LGRAY, 0.3)
      rowY_iq += ROW_H
    }

    // ── Totals ──
    const subtotalHT   = Number(doc.subtotal_ht    ?? 0)
    const totalTVA_iq  = Number(doc.total_tva      ?? 0)
    const totalTTC_iq  = Number(doc.total_ttc      ?? 0)
    const discountG    = Number(doc.discount_global ?? 0)
    const remainingAmt = Number(doc.remaining_amount ?? 0)

    const totalsNeeded = 110 + (isInvoice && ws.bank_iban ? 50 : 0) + (ws.invoice_footer || ws.quote_footer ? 20 : 0) + (doc.notes ? 30 : 0)
    if (rowY_iq + totalsNeeded > TABLE_END_IQ) newIqPage()

    const dLast_iq = drawFns[curIdx]
    const totX_iq  = MARGIN + CW - 170
    let tY_iq      = rowY_iq + 12

    function iqTotRow(label: string, value: string, bold = false, color = DARK) {
      const lf   = bold ? fontB : fontR
      const size = bold ? 9.5 : 8.5
      dLast_iq.text(label, totX_iq, tY_iq, size, lf, color)
      const vW = (bold ? fontB : fontR).widthOfTextAtSize(value, size)
      dLast_iq.text(value, MARGIN + CW - vW, tY_iq, size, bold ? fontB : fontR, color)
      tY_iq += bold ? 16 : 13
    }

    dLast_iq.line(MARGIN, tY_iq - 4, MARGIN + CW, tY_iq - 4, LGRAY, 0.8); tY_iq += 4
    iqTotRow('Sous-total HT', fmt(subtotalHT))
    if (discountG > 0) iqTotRow('Remise globale', '-\u00a0' + fmt(discountG), false, RED)
    iqTotRow('TVA\u00a0(' + (totalTVA_iq > 0 && subtotalHT > 0 ? Math.round(totalTVA_iq / subtotalHT * 100) : 20) + '%)', fmt(totalTVA_iq))
    dLast_iq.line(totX_iq, tY_iq - 3, MARGIN + CW, tY_iq - 3, BLUE, 0.7); tY_iq += 4
    iqTotRow('Total TTC', fmt(totalTTC_iq), true, NAVY)

    if (!isInvoice) {
      const depositAmt  = Number(doc.deposit_amount ?? 0)
      const depositType = doc.deposit_type
      if (depositAmt > 0) {
        const depositDisplay = depositType === 'percent'
          ? fmt(totalTTC_iq * depositAmt / 100) + ' (' + depositAmt.toFixed(0) + '%)'
          : fmt(depositAmt)
        tY_iq += 5
        iqTotRow('Acompte demand\u00e9', depositDisplay, false, BLUE)
      }
    }

    if (isInvoice && remainingAmt > 0) {
      tY_iq += 5
      iqTotRow('Reste \u00e0 payer', fmt(remainingAmt), true, remainingAmt > 0 ? RED : GREEN)
    }

    // Notes
    if (doc.notes) {
      tY_iq += 12
      dLast_iq.text('Notes\u00a0:', MARGIN, tY_iq, 8, fontB, GRAY); tY_iq += 13
      const words = safe(doc.notes).split(' ')
      let line = ''
      for (const word of words) {
        const test = line ? line + ' ' + word : word
        if (fontR.widthOfTextAtSize(test, 8) > CW - 10) {
          dLast_iq.text(line, MARGIN, tY_iq, 8, fontR, GRAY); tY_iq += 11; line = word
        } else { line = test }
      }
      if (line) { dLast_iq.text(line, MARGIN, tY_iq, 8, fontR, GRAY); tY_iq += 11 }
    }

    // Bank info (invoices)
    if (isInvoice && (ws.bank_iban || ws.bank_bic)) {
      tY_iq += 14
      dLast_iq.rect(MARGIN, tY_iq - 4, CW, 1, LGRAY); tY_iq += 8
      dLast_iq.text('R\u00c8GLEMENT PAR VIREMENT', MARGIN, tY_iq, 7.5, fontB, NAVY); tY_iq += 12
      if (ws.bank_account_holder) { dLast_iq.text('B\u00e9n\u00e9ficiaire\u00a0: ' + safe(ws.bank_account_holder), MARGIN, tY_iq, 8, fontR, DARK); tY_iq += 11 }
      if (ws.bank_iban)           { dLast_iq.text('IBAN\u00a0: ' + safe(ws.bank_iban), MARGIN, tY_iq, 8, fontR, DARK); tY_iq += 11 }
      if (ws.bank_bic)            { dLast_iq.text('BIC\u00a0: ' + safe(ws.bank_bic), MARGIN, tY_iq, 8, fontR, DARK); tY_iq += 11 }
    }

    // ── Footer bar on all pages ──
    const footerText = safe(isInvoice ? ws.invoice_footer : ws.quote_footer)
    const legalMention = !isInvoice ? ('Ce devis est valable ' + (doc.expiry_date ? 'jusqu\'au ' + fmtD(doc.expiry_date) : '30 jours') + '. Pass\u00e9 ce d\u00e9lai, il devra \u00eatre renouvel\u00e9.') : ''
    drawFooterBar(pages, fontR, fontB, footerText || (docTitle + ' n\u00b0 ' + docNumber), legalMention)

    return new Response(JSON.stringify({ pdf_url: await pdfToBase64(pdfDoc) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error) || 'Erreur inconnue'
    console.error('[generate-pdf] Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
