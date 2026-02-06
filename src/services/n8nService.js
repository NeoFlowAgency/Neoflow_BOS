const N8N_BASE_URL = 'https://n8n.srv1137119.hstgr.cloud/webhook'

async function postJSON(endpoint, data) {
  const response = await fetch(`${N8N_BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || `Erreur appel ${endpoint}`)
  }
  return response.json()
}

export const n8nService = {
  createInvoice(invoiceData) {
    return postJSON('create-invoice', invoiceData)
  },

  createQuote(quoteData) {
    return postJSON('create-quote', quoteData)
  },

  convertQuoteToInvoice(quoteId) {
    return postJSON('convert-quote-to-invoice', { quote_id: quoteId })
  },

  generatePdf(documentType, documentId) {
    return postJSON('process-generate-pdf', {
      job_id: crypto.randomUUID(),
      payload: JSON.stringify({ document_type: documentType, document_id: documentId })
    })
  },

  sendEmail(to, subject, html) {
    return postJSON('process-send-email', {
      job_id: crypto.randomUUID(),
      payload: JSON.stringify({ to, subject, html, from: 'onboarding@resend.dev' })
    })
  },

  sendPaymentReminder(invoiceId, workspaceId) {
    return postJSON('send-payment-reminder', {
      invoice_id: invoiceId,
      workspace_id: workspaceId
    })
  }
}
