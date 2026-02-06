const WEBHOOKS = {
  creerFacture: 'https://n8n.srv1137119.hstgr.cloud/webhook/create-invoice',
  genererPdf: 'https://n8n.srv1137119.hstgr.cloud/webhook/generer-pdf',
  envoyerEmail: 'https://n8n.srv1137119.hstgr.cloud/webhook/envoyer-email',
  creerLivraison: 'https://n8n.srv1137119.hstgr.cloud/webhook/creer-livraison',
  creerDevis: 'https://n8n.srv1137119.hstgr.cloud/webhook/create-quote',
  convertirDevis: 'https://n8n.srv1137119.hstgr.cloud/webhook/convert-quote-to-invoice',
  relancePaiement: 'https://n8n.srv1137119.hstgr.cloud/webhook/send-payment-reminder',
}

export const creerFacture = async (data) => {
  const response = await fetch(WEBHOOKS.creerFacture, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Erreur lors de la création de la facture')
  }
  return response.json()
}

export const genererPdf = async (factureId) => {
  const response = await fetch(WEBHOOKS.genererPdf, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: factureId }),
  })
  if (!response.ok) {
    throw new Error('Erreur lors de la génération du PDF')
  }
  return response.json()
}

export const envoyerEmail = async (factureId) => {
  const response = await fetch(WEBHOOKS.envoyerEmail, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: factureId }),
  })
  if (!response.ok) {
    throw new Error("Erreur lors de l'envoi de l'email")
  }
  return response.json()
}

export const creerLivraison = async (data) => {
  const response = await fetch(WEBHOOKS.creerLivraison, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Erreur lors de la création de la livraison')
  }
  return response.json()
}

export const creerDevis = async (data) => {
  const response = await fetch(WEBHOOKS.creerDevis, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Erreur lors de la création du devis')
  }
  return response.json()
}

export const convertirDevisEnFacture = async (quoteId) => {
  const response = await fetch(WEBHOOKS.convertirDevis, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote_id: quoteId }),
  })
  if (!response.ok) {
    throw new Error('Erreur lors de la conversion du devis')
  }
  return response.json()
}

export const relancePaiement = async (invoiceId, workspaceId) => {
  const response = await fetch(WEBHOOKS.relancePaiement, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId, workspace_id: workspaceId }),
  })
  if (!response.ok) {
    throw new Error('Erreur lors de l\'envoi de la relance')
  }
  return response.json()
}
