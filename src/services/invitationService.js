import { supabase } from '../lib/supabase'

/**
 * Hash a token using SHA-256
 */
async function hashToken(token) {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Create an invitation link for a workspace
 */
export const createInvitation = async (workspaceId, role = 'vendeur', email = null) => {
  const token = crypto.randomUUID()
  const tokenHash = await hashToken(token)

  const insertData = {
    workspace_id: workspaceId,
    invited_by: (await supabase.auth.getUser()).data.user.id,
    token_hash: tokenHash,
    role,
  }
  if (email) insertData.email = email

  const { error } = await supabase
    .from('workspace_invitations')
    .insert(insertData)

  if (error) {
    console.error('[createInvitation] Erreur:', error)
    throw new Error('Impossible de créer l\'invitation: ' + error.message)
  }

  const url = `${window.location.origin}/join?token=${token}`
  return { token, url }
}

/**
 * List active invitations for a workspace
 */
export const listInvitations = async (workspaceId) => {
  const { data, error } = await supabase
    .from('workspace_invitations')
    .select('id, role, email, expires_at, used_at, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[listInvitations] Erreur:', error)
    throw new Error('Impossible de charger les invitations: ' + error.message)
  }

  return data || []
}

/**
 * Revoke (delete) an invitation
 */
export const revokeInvitation = async (invitationId) => {
  const { error } = await supabase
    .from('workspace_invitations')
    .delete()
    .eq('id', invitationId)

  if (error) {
    console.error('[revokeInvitation] Erreur:', error)
    throw new Error('Impossible de révoquer l\'invitation: ' + error.message)
  }
}
