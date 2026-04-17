// ============================================================
// NeoFlow BOS - Edge Function: generate-pdf
// Deploy: supabase functions deploy generate-pdf
// ============================================================
// Input: { document_type: 'invoice' | 'quote' | 'order', document_id: uuid }
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

    // ─── Bon de commande (type 'order') ──────────────────────────────
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

      // Verify membership
      if (order.workspace_id) {
        const { data: membership } = await supabase.from('workspace_users').select('id').eq('workspace_id', order.workspace_id).eq('user_id', user.id).single()
        if (!membership) {
          return new Response(JSON.stringify({ error: 'Acces refuse' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }

      // ─── Build order PDF ─────────────────────────────────────
      const pdfDoc = await PDFDocument.create()
      const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      const ws   = order.workspace || {}
      const cust = order.customer  || {}
      const orderItems = order.items || []

      const orderNumber = safe(order.order_number || (order.id ? String(order.id).slice(0, 8).toUpperCase() : ''))

      // Totals
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

      const wsAddr = [
        safe(ws.address),
        [safe(ws.postal_code), safe(ws.city)].filter(Boolean).join(' '),
      ].filter(Boolean)

      // Fetch logo
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

      // Column layout
      const COL = { desc: 240, qty: 40, pu: 80, tva: 45, total: 80 }
      const ROW_H = 22
      const HEADER_H = 210
      const FOOTER_H = 160
      const TABLE_START = HEADER_H
      const TABLE_END = PAGE_H - FOOTER_H

      function addPage() { return pdfDoc.addPage([PAGE_W, PAGE_H]) }

      const page1 = addPage()

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

      // Top blue bar
      d1.rect(0, 0, PAGE_W, 8, BLUE)

      // Logo or workspace name (top-left)
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

      // Workspace info (top-right)
      const wsInfoX = PAGE_W - MARGIN
      let wsY = 28
      d1.text(safe(ws.name), wsInfoX - fontB.widthOfTextAtSize(safe(ws.name), 10), wsY, 10, fontB, NAVY)
      wsY += 14
      for (const line of wsAddr) {
        d1.text(line, wsInfoX - fontR.widthOfTextAtSize(line, 8), wsY, 8, fontR, GRAY)
        wsY += 11
      }
      if (ws.phone) {
        d1.text(safe(ws.phone), wsInfoX - fontR.widthOfTextAtSize(safe(ws.phone), 8), wsY, 8, fontR, GRAY); wsY += 11
      }
      if (ws.email) {
        d1.text(safe(ws.email), wsInfoX - fontR.widthOfTextAtSize(safe(ws.email), 8), wsY, 8, fontR, GRAY); wsY += 11
      }
      if (ws.siret) {
        const t = 'SIRET: ' + safe(ws.siret)
        d1.text(t, wsInfoX - fontR.widthOfTextAtSize(t, 8), wsY, 8, fontR, GRAY); wsY += 11
      }
      if (ws.ape_code) {
        const t = 'APE: ' + safe(ws.ape_code)
        d1.text(t, wsInfoX - fontR.widthOfTextAtSize(t, 8), wsY, 8, fontR, GRAY); wsY += 11
      }
      if (ws.legal_capital) {
        const t = 'Capital: ' + safe(ws.legal_capital)
        d1.text(t, wsInfoX - fontR.widthOfTextAtSize(t, 8), wsY, 8, fontR, GRAY); wsY += 11
      }

      // Title band
      const titleY = 85
      d1.rect(MARGIN, titleY, CW, 32, NAVY)
      d1.text('BON DE COMMANDE', MARGIN + 12, titleY + 10, 15, fontB, WHITE)
      d1.text('N\u00b0 ' + orderNumber, MARGIN + 12, titleY + 23, 9, fontR, rgb(0.7, 0.75, 1))

      // Date (right side of title band)
      const dateStr = 'Date : ' + fmtD(order.created_at)
      d1.text(dateStr, PAGE_W - MARGIN - fontR.widthOfTextAtSize(dateStr, 8) - 10, titleY + 16, 8, fontR, WHITE)

      // Client block (left)
      const cY = 128
      d1.text('CLIENT', MARGIN, cY, 7, fontB, BLUE)
      d1.line(MARGIN, cY + 10, MARGIN + 180, cY + 10, BLUE, 0.5)
      let cLineY = cY + 18
      const clientName = safe(cust.company_name || cust.full_name)
      if (clientName) {
        d1.text(clientName, MARGIN, cLineY, 10, fontB, DARK); cLineY += 14
      }
      if (cust.full_name && cust.company_name) {
        d1.text(safe(cust.full_name), MARGIN, cLineY, 8.5, fontR, DARK); cLineY += 12
      }
      for (const line of clientAddr) {
        d1.text(line, MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11
      }
      if (cust.phone) { d1.text(safe(cust.phone), MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11 }
      if (cust.email) { d1.text(safe(cust.email), MARGIN, cLineY, 8.5, fontR, GRAY); cLineY += 11 }

      // Conseiller block (right)
      d1.text('Votre Conseiller', PAGE_W - MARGIN - 160, cY, 7, fontB, BLUE)
      d1.line(PAGE_W - MARGIN - 160, cY + 10, PAGE_W - MARGIN, cY + 10, BLUE, 0.5)

      // Delivery dates
      if (order.wished_delivery_date || order.max_delivery_date) {
        const dateX = PAGE_W - MARGIN - 160
        let dateY = cY + 18
        d1.text('Dates de livraison', dateX, dateY, 8, fontB, NAVY); dateY += 12
        if (order.wished_delivery_date) {
          d1.text('Souhaitee : ' + fmtD(order.wished_delivery_date), dateX, dateY, 8, fontR, DARK); dateY += 11
        }
        if (order.max_delivery_date) {
          d1.text('Au plus tard : ' + fmtD(order.max_delivery_date), dateX, dateY, 8, fontR, DARK)
        }
      }

      // Table header
      const tHeaderY = TABLE_START - 28
      d1.rect(MARGIN, tHeaderY, CW, 18, NAVY)
      const colX = {
        desc:  MARGIN + 6,
        qty:   MARGIN + COL.desc + 6,
        pu:    MARGIN + COL.desc + COL.qty + 6,
        tva:   MARGIN + COL.desc + COL.qty + COL.pu + 6,
        total: MARGIN + COL.desc + COL.qty + COL.pu + COL.tva + 6,
      }
      d1.text('Description', colX.desc,  tHeaderY + 5, 8, fontB, WHITE)
      d1.text('Qte',         colX.qty,   tHeaderY + 5, 8, fontB, WHITE)
      d1.text('PU HT',       colX.pu,    tHeaderY + 5, 8, fontB, WHITE)
      d1.text('TVA',         colX.tva,   tHeaderY + 5, 8, fontB, WHITE)
      d1.text('Total HT',    colX.total, tHeaderY + 5, 8, fontB, WHITE)

      // Rows
      let rowY  = TABLE_START
      const pages   = [page1]
      const drawFns = [d1]
      let curIdx = 0

      function newPage() {
        const np = addPage()
        pages.push(np)
        const nd = draw(np)
        drawFns.push(nd)
        curIdx++
        nd.rect(0, 0, PAGE_W, 8, BLUE)
        nd.rect(MARGIN, 30, CW, 18, NAVY)
        nd.text('Description', colX.desc,  35, 8, fontB, WHITE)
        nd.text('Qte',         colX.qty,   35, 8, fontB, WHITE)
        nd.text('PU HT',       colX.pu,    35, 8, fontB, WHITE)
        nd.text('TVA',         colX.tva,   35, 8, fontB, WHITE)
        nd.text('Total HT',    colX.total, 35, 8, fontB, WHITE)
        rowY = 55
        return nd
      }

      for (let i = 0; i < orderItems.length; i++) {
        const item = orderItems[i]
        const qty    = Number(item.quantity     ?? 0)
        const puHT   = Number(item.unit_price_ht ?? 0)
        const tvaRate= Number(item.tax_rate     ?? 20)
        const totHT  = Number(item.total_ht    ?? qty * puHT)
        const eco    = Number(item.eco_participation ?? 0)
        const extra  = eco > 0 ? 14 : 0

        if (rowY + ROW_H + extra > TABLE_END) {
          newPage()
        }
        const d = drawFns[curIdx]
        const bg = i % 2 === 0 ? WHITE : LGRAY
        d.rect(MARGIN, rowY, CW, ROW_H + extra, bg)

        // Description: product name + variant
        let desc = safe(item.product?.name || item.description)
        if (item.variant) {
          const vparts: string[] = []
          if (item.variant.size)    vparts.push(safe(item.variant.size))
          if (item.variant.comfort) vparts.push(safe(item.variant.comfort))
          if (vparts.length > 0) desc += ' (' + vparts.join(' - ') + ')'
        }

        d.text(truncate(desc, 52), colX.desc, rowY + 7, 8.5, fontR, DARK)
        d.text(qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2), colX.qty, rowY + 7, 8.5, fontR, DARK)
        d.text(fmt(puHT),  colX.pu,    rowY + 7, 8.5, fontR, DARK)
        d.text(tvaRate.toFixed(0) + '%', colX.tva, rowY + 7, 8.5, fontR, DARK)
        d.text(fmt(totHT), colX.total, rowY + 7, 8.5, fontR, DARK)

        if (eco > 0) {
          d.text('dont eco-participation DEA : ' + fmt(eco) + ' TTC', colX.desc + 10, rowY + ROW_H - 3, 7, fontR, GRAY)
        }

        d.line(MARGIN, rowY + ROW_H + extra, MARGIN + CW, rowY + ROW_H + extra, LGRAY, 0.3)
        rowY += ROW_H + extra
      }

      // Totals
      const acomptes = (order.order_payments || []).filter((p: any) => p.payment_type === 'acompte')
      const needsForExtras = 95 + (acomptes.length > 0 ? 20 + acomptes.length * 11 + 20 : 0) + (order.old_furniture_option && order.old_furniture_option !== 'keep' ? 35 : 0) + 60
      if (rowY + needsForExtras > PAGE_H - 40) {
        newPage()
      }

      const dLast = drawFns[curIdx]
      const totX  = MARGIN + CW - 170
      let tY = rowY + 12

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

      drawTotalRow('Sous-total HT', fmt(totalHT))
      drawTotalRow('TVA (' + (totalTVA > 0 && totalHT > 0 ? Math.round(totalTVA / totalHT * 100) : 20) + '%)', fmt(totalTVA))
      dLast.line(totX, tY - 3, MARGIN + CW, tY - 3, BLUE, 0.7)
      tY += 4
      drawTotalRow('Total TTC', fmt(totalTTC), true, NAVY)

      // Acomptes
      if (acomptes.length > 0) {
        tY += 10
        dLast.text('Acompte encaisse', MARGIN, tY, 8, fontB, NAVY); tY += 12

        const modeLabels: Record<string, string> = {
          cb: 'CB', cash: 'Especes', cheque: 'Cheque', virement: 'Virement', financement: 'Financement'
        }
        let totalAcompte = 0
        for (const p of acomptes) {
          const label = modeLabels[p.mode] || safe(p.mode)
          const amount = Number(p.amount ?? 0)
          totalAcompte += amount
          dLast.text(label + ' :', MARGIN + 10, tY, 8, fontR, DARK)
          dLast.text(fmt(amount), MARGIN + 120, tY, 8, fontR, DARK)
          tY += 11
        }

        const solde = Math.max(0, Number(order.total_ttc ?? totalTTC) - totalAcompte)
        if (solde > 0) {
          tY += 4
          dLast.text('A encaisser a la livraison :', MARGIN + 10, tY, 8.5, fontB, NAVY)
          dLast.text(fmt(solde), MARGIN + 180, tY, 8.5, fontB, NAVY)
          tY += 14
        }
      }

      // Old furniture option
      const repriseLabels: Record<string, string> = {
        keep: 'Conserver ses anciens meubles',
        ess: 'Don a une ESS',
        dechetterie: 'Dechetterie / point de collecte',
        reprise: 'Reprise gratuite par le magasin',
      }
      if (order.old_furniture_option && order.old_furniture_option !== 'keep') {
        tY += 10
        dLast.text('Reprise des anciens meubles :', MARGIN, tY, 8, fontB, GRAY); tY += 11
        dLast.text('[x] ' + (repriseLabels[order.old_furniture_option] || safe(order.old_furniture_option)), MARGIN + 10, tY, 8, fontR, DARK)
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
      dLast.text('Lu et approuve', MARGIN, tY, 7, fontR, GRAY)

      // Footer on every page
      const legalInfo = [
        ws.siret         ? 'SIRET ' + safe(ws.siret) : '',
        ws.ape_code      ? 'APE '   + safe(ws.ape_code) : '',
        ws.legal_capital ? 'Capital ' + safe(ws.legal_capital) : '',
      ].filter(Boolean).join(' - ')

      const barY = PAGE_H - 35
      for (let pi = 0; pi < pages.length; pi++) {
        const dp = draw(pages[pi])
        dp.rect(0, barY, PAGE_W, 35, NAVY)

        dp.text('Bon de commande n\u00b0 ' + orderNumber, MARGIN, barY + 8, 7, fontR, rgb(0.7, 0.75, 1))

        if (legalInfo) {
          dp.text(truncate(legalInfo, 110), MARGIN, barY + 22, 6.5, fontR, rgb(0.65, 0.7, 0.95))
        }

        const pgLabel = pages.length > 1 ? 'Page ' + (pi + 1) + ' / ' + pages.length : ''
        if (pgLabel) {
          const pgW = fontR.widthOfTextAtSize(pgLabel, 7)
          dp.text(pgLabel, PAGE_W - MARGIN - pgW, barY + 22, 7, fontR, rgb(0.7, 0.75, 1))
        }
      }

      // Save & upload
      const pdfBytes = await pdfDoc.save()
      const fileName = `order_${document_id}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('pdfs').getPublicUrl(fileName)

      return new Response(
        JSON.stringify({ pdf_url: publicUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── Bon de livraison (type 'delivery_note') ─────────────────────────
    if (document_type === 'delivery_note') {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, created_at,
          total_ttc, amount_paid, remaining_amount,
          old_furniture_option, delivered_at,
          wished_delivery_date, max_delivery_date,
          customer:customers(first_name, last_name, phone, address, city, postal_code),
          items:order_items(
            id, description, quantity, unit_price_ht, tax_rate, total_ht,
            eco_participation,
            product:products(id, name, reference),
            variant:product_variants(id, size, comfort)
          ),
          order_payments(id, payment_type, mode, amount),
          workspace:workspaces(
            name, address, city, postal_code, phone, email, siret, ape_code, legal_capital,
            logo_url
          )
        `)
        .eq('id', document_id)
        .single()

      if (orderError || !order) {
        return new Response(JSON.stringify({ error: 'Commande introuvable' }), { status: 404, headers: corsHeaders })
      }

      // Verify membership
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

      const payments = (order as any).order_payments || []
      const totalAcompte = payments
        .filter((p: any) => p.payment_type === 'acompte')
        .reduce((s: number, p: any) => s + Number(p.amount), 0)
      const soldeRestant = Math.max(0, Number((order as any).total_ttc || 0) - totalAcompte)

      const NAVY_DN = rgb(4/255, 7/255, 65/255)
      const BLUE_DN = rgb(49/255, 58/255, 223/255)
      const LIGHT_DN = rgb(245/255, 246/255, 255/255)

      const pdfDoc_dn = await PDFDocument.create()
      const font_dn     = await pdfDoc_dn.embedFont(StandardFonts.Helvetica)
      const fontBold_dn = await pdfDoc_dn.embedFont(StandardFonts.HelveticaBold)

      const page_dn = pdfDoc_dn.addPage([595.28, 841.89])
      const { width: w_dn, height: h_dn } = page_dn.getSize()
      let y_dn = h_dn

      const ws_dn = (order as any).workspace as any
      const customer_dn = (order as any).customer as any
      const customerName_dn = customer_dn ? `${customer_dn.first_name || ''} ${customer_dn.last_name || ''}`.trim() : ''

      page_dn.drawRectangle({ x: 0, y: h_dn - 8, width: w_dn, height: 8, color: BLUE_DN })
      y_dn = h_dn - 8

      page_dn.drawText(ws_dn?.name || 'Magasin', { x: 40, y: y_dn - 28, size: 14, font: fontBold_dn, color: NAVY_DN })
      const wsInfoLines_dn = [
        ws_dn?.address, [ws_dn?.postal_code, ws_dn?.city].filter(Boolean).join(' '),
        ws_dn?.phone, ws_dn?.email,
      ].filter(Boolean) as string[]
      wsInfoLines_dn.forEach((line, i) => {
        page_dn.drawText(line, { x: 40, y: y_dn - 44 - i * 12, size: 8, font: font_dn, color: rgb(0.4, 0.4, 0.4) })
      })
      y_dn = y_dn - 44 - wsInfoLines_dn.length * 12 - 8

      page_dn.drawRectangle({ x: 0, y: y_dn - 34, width: w_dn, height: 34, color: NAVY_DN })
      page_dn.drawText('BON DE LIVRAISON', { x: 40, y: y_dn - 23, size: 14, font: fontBold_dn, color: rgb(1, 1, 1) })
      const dateStr_dn = (delivery as any)?.scheduled_date
        ? new Date((delivery as any).scheduled_date).toLocaleDateString('fr-FR')
        : new Date((order as any).created_at).toLocaleDateString('fr-FR')
      page_dn.drawText(`N\u00b0 ${(order as any).order_number}  |  Date : ${dateStr_dn}`, {
        x: w_dn - 240, y: y_dn - 23, size: 9, font: font_dn, color: rgb(0.8, 0.8, 0.8)
      })
      y_dn -= 50

      page_dn.drawRectangle({ x: 40, y: y_dn - 80, width: 250, height: 80, color: LIGHT_DN })
      page_dn.drawText('CLIENT', { x: 50, y: y_dn - 14, size: 8, font: fontBold_dn, color: BLUE_DN })
      page_dn.drawText(customerName_dn, { x: 50, y: y_dn - 28, size: 10, font: fontBold_dn, color: NAVY_DN })
      const addr_dn = (delivery as any)?.delivery_address || [customer_dn?.address, customer_dn?.postal_code, customer_dn?.city].filter(Boolean).join(', ')
      if (addr_dn) {
        const words_dn = addr_dn.split(' ')
        let line_dn = ''
        let lineY_dn = y_dn - 42
        words_dn.forEach((w: string) => {
          const test = line_dn ? `${line_dn} ${w}` : w
          if (font_dn.widthOfTextAtSize(test, 8) > 230) {
            page_dn.drawText(line_dn, { x: 50, y: lineY_dn, size: 8, font: font_dn, color: NAVY_DN })
            lineY_dn -= 11
            line_dn = w
          } else { line_dn = test }
        })
        if (line_dn) page_dn.drawText(line_dn, { x: 50, y: lineY_dn, size: 8, font: font_dn, color: NAVY_DN })
      }
      if (customer_dn?.phone) {
        page_dn.drawText(`T\u00e9l : ${customer_dn.phone}`, { x: 50, y: y_dn - 72, size: 8, font: font_dn, color: rgb(0.4, 0.4, 0.4) })
      }

      if ((delivery as any)?.time_slot || (delivery as any)?.scheduled_date) {
        page_dn.drawRectangle({ x: 310, y: y_dn - 80, width: 245, height: 80, color: LIGHT_DN })
        page_dn.drawText('CR\u00c9NEAU DE LIVRAISON', { x: 320, y: y_dn - 14, size: 8, font: fontBold_dn, color: BLUE_DN })
        if ((delivery as any).scheduled_date) {
          page_dn.drawText(new Date((delivery as any).scheduled_date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            { x: 320, y: y_dn - 28, size: 9, font: fontBold_dn, color: NAVY_DN })
        }
        if ((delivery as any).time_slot) {
          page_dn.drawText((delivery as any).time_slot, { x: 320, y: y_dn - 42, size: 12, font: fontBold_dn, color: BLUE_DN })
        }
      }
      y_dn -= 96

      const items_dn = ((order as any).items || []) as any[]
      page_dn.drawRectangle({ x: 40, y: y_dn - 18, width: w_dn - 80, height: 18, color: NAVY_DN })
      const headers_dn = ['D\u00e9signation', 'Qt\u00e9', 'P.U. TTC', 'Total TTC']
      const colX_dn = [50, 360, 420, 500]
      headers_dn.forEach((h, i) => {
        page_dn.drawText(h, { x: colX_dn[i], y: y_dn - 13, size: 8, font: fontBold_dn, color: rgb(1, 1, 1) })
      })
      y_dn -= 18

      items_dn.forEach((item: any) => {
        if (y_dn < 120) return
        const itemHeight = 22
        const ttcUnit = Number(item.unit_price_ht || 0) * (1 + Number(item.tax_rate || 20) / 100)
        const ttcTotal = ttcUnit * Number(item.quantity || 1)
        const label = item.description || item.product?.name || 'Article'
        const variantSuffix = item.variant
          ? ` \u2014 ${item.variant.size}${item.variant.comfort ? ' ' + item.variant.comfort : ''}`
          : ''
        page_dn.drawText(label + variantSuffix, { x: colX_dn[0], y: y_dn - 14, size: 9, font: fontBold_dn, color: NAVY_DN, maxWidth: 290 })
        page_dn.drawText(String(item.quantity || 1), { x: colX_dn[1], y: y_dn - 14, size: 9, font: font_dn, color: NAVY_DN })
        page_dn.drawText(`${ttcUnit.toFixed(2)} \u20ac`, { x: colX_dn[2], y: y_dn - 14, size: 9, font: font_dn, color: NAVY_DN })
        page_dn.drawText(`${ttcTotal.toFixed(2)} \u20ac`, { x: colX_dn[3], y: y_dn - 14, size: 9, font: fontBold_dn, color: NAVY_DN })
        if (Number(item.eco_participation) > 0) {
          page_dn.drawText(`  \u00c9co-participation DEA : ${Number(item.eco_participation).toFixed(2)} \u20ac`,
            { x: colX_dn[0], y: y_dn - 25, size: 7, font: font_dn, color: rgb(0.5, 0.5, 0.5) })
          y_dn -= 11
        }
        y_dn -= itemHeight
        page_dn.drawLine({ start: { x: 40, y: y_dn }, end: { x: w_dn - 40, y: y_dn }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) })
      })

      y_dn -= 16
      const totalTTC_dn = Number((order as any).total_ttc || 0)
      page_dn.drawRectangle({ x: w_dn - 230, y: y_dn - 60, width: 190, height: 60, color: LIGHT_DN })
      page_dn.drawText('Total TTC', { x: w_dn - 220, y: y_dn - 14, size: 9, font: font_dn, color: NAVY_DN })
      page_dn.drawText(`${totalTTC_dn.toFixed(2)} \u20ac`, { x: w_dn - 60, y: y_dn - 14, size: 9, font: fontBold_dn, color: NAVY_DN })
      if (totalAcompte > 0) {
        page_dn.drawText('Acompte vers\u00e9', { x: w_dn - 220, y: y_dn - 28, size: 9, font: font_dn, color: rgb(0.4, 0.4, 0.4) })
        page_dn.drawText(`- ${totalAcompte.toFixed(2)} \u20ac`, { x: w_dn - 70, y: y_dn - 28, size: 9, font: font_dn, color: rgb(0.4, 0.4, 0.4) })
      }
      page_dn.drawLine({ start: { x: w_dn - 225, y: y_dn - 35 }, end: { x: w_dn - 50, y: y_dn - 35 }, thickness: 1, color: BLUE_DN })
      page_dn.drawText('SOLDE \u00c0 ENCAISSER', { x: w_dn - 220, y: y_dn - 50, size: 9, font: fontBold_dn, color: BLUE_DN })
      page_dn.drawText(`${soldeRestant.toFixed(2)} \u20ac`, { x: w_dn - 75, y: y_dn - 50, size: 12, font: fontBold_dn, color: BLUE_DN })
      y_dn -= 80

      const OLD_FURNITURE_LABELS_DN: Record<string, string> = {
        keep: 'Client conserve ses anciens meubles',
        ess: 'Don ESS (association)',
        dechetterie: 'D\u00e9chetterie / point de collecte',
        reprise: 'Reprise gratuite par le magasin',
      }
      if ((order as any).old_furniture_option) {
        page_dn.drawRectangle({ x: 40, y: y_dn - 28, width: w_dn - 80, height: 28, color: LIGHT_DN })
        page_dn.drawText('REPRISE ANCIENS MEUBLES :', { x: 50, y: y_dn - 18, size: 9, font: fontBold_dn, color: NAVY_DN })
        page_dn.drawText(OLD_FURNITURE_LABELS_DN[(order as any).old_furniture_option] || (order as any).old_furniture_option, { x: 215, y: y_dn - 18, size: 9, font: font_dn, color: NAVY_DN })
        y_dn -= 42
      }

      y_dn -= 20
      page_dn.drawLine({ start: { x: 40, y: y_dn }, end: { x: 280, y: y_dn }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) })
      page_dn.drawLine({ start: { x: 310, y: y_dn }, end: { x: w_dn - 40, y: y_dn }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) })
      page_dn.drawText('Signature livreur', { x: 40, y: y_dn - 12, size: 8, font: font_dn, color: rgb(0.5, 0.5, 0.5) })
      page_dn.drawText('Signature client (bon pour accord)', { x: 310, y: y_dn - 12, size: 8, font: font_dn, color: rgb(0.5, 0.5, 0.5) })

      const footerParts_dn = [ws_dn?.siret ? `SIRET : ${ws_dn.siret}` : '', ws_dn?.ape_code ? `APE : ${ws_dn.ape_code}` : '', ws_dn?.legal_capital ? `Capital : ${ws_dn.legal_capital}` : ''].filter(Boolean)
      page_dn.drawRectangle({ x: 0, y: 0, width: w_dn, height: 24, color: NAVY_DN })
      page_dn.drawText(footerParts_dn.join('   \u00b7   '), { x: 40, y: 8, size: 7, font: font_dn, color: rgb(0.7, 0.7, 0.8) })

      const pdfBytes_dn = await pdfDoc_dn.save()
      const base64_dn = btoa(String.fromCharCode(...new Uint8Array(pdfBytes_dn)))
      return new Response(JSON.stringify({ pdf_url: `data:application/pdf;base64,${base64_dn}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ─── Étiquettes produits (type 'label') ──────────────────────────────
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

      // Verify membership
      if ((order as any).workspace_id) {
        const { data: membership } = await supabase.from('workspace_users').select('id').eq('workspace_id', (order as any).workspace_id).eq('user_id', user.id).single()
        if (!membership) {
          return new Response(JSON.stringify({ error: 'Acces refuse' }), { status: 403, headers: corsHeaders })
        }
      }

      const NAVY_LB = rgb(4/255, 7/255, 65/255)
      const BLUE_LB = rgb(49/255, 58/255, 223/255)

      const pdfDoc_lb = await PDFDocument.create()
      const font_lb     = await pdfDoc_lb.embedFont(StandardFonts.Helvetica)
      const fontBold_lb = await pdfDoc_lb.embedFont(StandardFonts.HelveticaBold)

      const customer_lb = (order as any).customer as any
      const customerName_lb = customer_lb ? `${customer_lb.first_name || ''} ${customer_lb.last_name || ''}`.trim() : ''
      const orderNumber_lb = (order as any).order_number || ''
      const items_lb = ((order as any).items || []) as any[]

      const LABEL_W = 250
      const LABEL_H = 160
      const COL_POSITIONS = [40, 310]
      const ROW_POSITIONS = [690, 510, 330, 150]

      let page_lb = pdfDoc_lb.addPage([595.28, 841.89])
      let labelIndex = 0

      const drawLabel = (p: any, x: number, y: number, item: any) => {
        p.drawRectangle({ x, y, width: LABEL_W, height: LABEL_H, borderColor: BLUE_LB, borderWidth: 1.5, color: rgb(1, 1, 1) })
        p.drawRectangle({ x, y: y + LABEL_H - 24, width: LABEL_W, height: 24, color: NAVY_LB })
        p.drawText('NEOFLOW BOS', { x: x + 8, y: y + LABEL_H - 17, size: 8, font: fontBold_lb, color: rgb(1, 1, 1) })
        p.drawText(orderNumber_lb, { x: x + LABEL_W - 70, y: y + LABEL_H - 17, size: 8, font: fontBold_lb, color: rgb(0.8, 0.8, 1) })
        const ref = item.product?.reference || ''
        if (ref) {
          p.drawText(ref, { x: x + 8, y: y + LABEL_H - 38, size: 9, font: font_lb, color: rgb(0.5, 0.5, 0.5) })
        }
        const name = item.description || item.product?.name || 'Article'
        p.drawText(name, { x: x + 8, y: y + LABEL_H - 54, size: 11, font: fontBold_lb, color: NAVY_LB, maxWidth: LABEL_W - 16 })
        if (item.variant) {
          const variantLabel = [item.variant.size, item.variant.comfort].filter(Boolean).join(' \u2014 ')
          p.drawText(variantLabel, { x: x + 8, y: y + LABEL_H - 72, size: 12, font: fontBold_lb, color: BLUE_LB })
        }
        p.drawLine({ start: { x: x + 8, y: y + 48 }, end: { x: x + LABEL_W - 8, y: y + 48 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
        p.drawText('CLIENT', { x: x + 8, y: y + 36, size: 7, font: fontBold_lb, color: rgb(0.5, 0.5, 0.5) })
        p.drawText(customerName_lb, { x: x + 8, y: y + 22, size: 10, font: fontBold_lb, color: NAVY_LB, maxWidth: LABEL_W - 16 })
        p.drawText(`QT\u00c9 : ${item.quantity || 1}`, { x: x + LABEL_W - 55, y: y + 10, size: 9, font: fontBold_lb, color: BLUE_LB })
      }

      for (const item of items_lb) {
        const colIdx = labelIndex % 2
        const rowIdx = Math.floor(labelIndex / 2) % 4
        const x = COL_POSITIONS[colIdx]
        const y = ROW_POSITIONS[rowIdx]
        if (labelIndex > 0 && colIdx === 0 && rowIdx === 0) {
          page_lb = pdfDoc_lb.addPage([595.28, 841.89])
        }
        drawLabel(page_lb, x, y, item)
        labelIndex++
      }

      const pdfBytes_lb = await pdfDoc_lb.save()
      const base64_lb = btoa(String.fromCharCode(...new Uint8Array(pdfBytes_lb)))
      return new Response(JSON.stringify({ pdf_url: `data:application/pdf;base64,${base64_lb}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
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
