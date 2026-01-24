const WEBHOOKS = {
  creerDevis: 'https://n8n.srv1137119.hstgr.cloud/webhook/creer-devis',
  genererPdf: 'https://n8n.srv1137119.hstgr.cloud/webhook/generer-pdf',
  envoyerEmail: 'https://n8n.srv1137119.hstgr.cloud/webhook/envoyer-email',
  creerLivraison: 'https://n8n.srv1137119.hstgr.cloud/webhook/creer-livraison',
}

export const creerDevis = async (data) => {
  const response = await fetch(WEBHOOKS.creerDevis, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Erreur lors de la création du devis')
  }
  return response.json()
}

export const genererPdf = async (devisId) => {
  const response = await fetch(WEBHOOKS.genererPdf, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ devis_id: devisId }),
  })
  if (!response.ok) {
    throw new Error('Erreur lors de la génération du PDF')
  }
  return response.json()
}

export const envoyerEmail = async (devisId) => {
  const response = await fetch(WEBHOOKS.envoyerEmail, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ devis_id: devisId }),
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
