import { supabase } from '../lib/supabase'

/**
 * Ajoute un paiement (acompte ou solde) sur une commande
 */
export async function addOrderPayment(workspaceId, orderId, userId, paymentData) {
  const { data, error } = await supabase
    .from('order_payments')
    .insert({
      workspace_id: workspaceId,
      order_id: orderId,
      payment_type: paymentData.payment_type || 'acompte',
      mode: paymentData.mode || 'cb',
      amount: paymentData.amount,
      paid_at: paymentData.paid_at || new Date().toISOString(),
      notes: paymentData.notes || null,
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw new Error('Erreur enregistrement paiement: ' + error.message)
  return data
}

/**
 * Liste les paiements d'une commande
 */
export async function listOrderPayments(orderId) {
  const { data, error } = await supabase
    .from('order_payments')
    .select('*')
    .eq('order_id', orderId)
    .order('paid_at')
  if (error) throw new Error('Erreur chargement paiements: ' + error.message)
  return data || []
}

/**
 * Calcule le total encaissé et le solde restant d'une commande
 * @returns { totalPaid, totalAcompte, totalSolde, remaining }
 */
export function computePaymentSummary(payments, orderTotal) {
  const totalAcompte = payments
    .filter(p => p.payment_type === 'acompte')
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const totalSolde = payments
    .filter(p => p.payment_type === 'solde')
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const totalPaid = totalAcompte + totalSolde
  const remaining = Math.max(0, Number(orderTotal) - totalPaid)
  return { totalPaid, totalAcompte, totalSolde, remaining }
}

/**
 * Vérifie si une commande est prête à livrer via RPC Supabase
 */
export async function checkOrderReadyToDeliver(orderId) {
  const { data, error } = await supabase.rpc('is_order_ready_to_deliver', { order_id: orderId })
  if (error) throw new Error('Erreur vérification livraison: ' + error.message)
  return data === true
}

/**
 * Supprime un paiement
 */
export async function deleteOrderPayment(paymentId) {
  const { error } = await supabase
    .from('order_payments')
    .delete()
    .eq('id', paymentId)
  if (error) throw new Error('Erreur suppression paiement: ' + error.message)
}
