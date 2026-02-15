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
 * Send an email via Resend
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @returns {{ success: boolean }}
 */
export const sendEmail = (to, subject, html) =>
  invokeFunction('send-email', { to, subject, html })
