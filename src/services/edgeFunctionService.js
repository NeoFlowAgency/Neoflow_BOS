import { invokeFunction } from '../lib/supabase'

/**
 * Generate a PDF for an invoice or quote
 * @param {'invoice'|'quote'} documentType
 * @param {string} documentId - UUID of the document
 * @returns {{ pdf_url: string }}
 */
export const generatePdf = (documentType, documentId) =>
  invokeFunction('generate-pdf', { document_type: documentType, document_id: documentId })

/**
 * Send an email via SMTP (Gmail)
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @returns {{ success: boolean }}
 */
export const sendEmail = (to, subject, html) =>
  invokeFunction('send-email', { to, subject, html })

/**
 * Send an SMS via Brevo
 * @param {string} workspaceId - Workspace UUID (API key stored there)
 * @param {string} to - Phone number (0612345678 or +33612345678)
 * @param {Object} options - { message } or { template, variables }
 * @returns {{ success: boolean, message_id?: string }}
 */
export const sendSms = (workspaceId, to, options) =>
  invokeFunction('send-sms', { workspace_id: workspaceId, to, ...options })
