import { supabase } from '../lib/supabase'

/**
 * Generate a URL-friendly slug from a name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')    // replace non-alphanumeric with dash
    .replace(/^-+|-+$/g, '')        // trim leading/trailing dashes
    .substring(0, 30)               // max length
    || 'workspace'
}

export const createWorkspace = async (name, userId) => {
  const slug = generateSlug(name)

  // 1. Create workspace
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name, slug })
    .select()
    .single()

  if (wsError) {
    console.error('[createWorkspace] Erreur création workspace:', wsError)
    throw new Error('Impossible de créer le workspace: ' + wsError.message)
  }

  // 2. Add user as admin
  const { error: userError } = await supabase
    .from('workspace_users')
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: 'admin'
    })

  // 23505 = unique_violation (user already in this workspace) - safe to ignore
  if (userError && userError.code !== '23505') {
    console.error('[createWorkspace] Erreur ajout utilisateur:', userError)
    throw new Error('Workspace créé mais impossible de vous y ajouter: ' + userError.message)
  }

  return workspace
}

export const getUserWorkspaces = async (userId) => {
  const { data, error } = await supabase
    .from('workspace_users')
    .select('workspace_id, role, workspaces(*)')
    .eq('user_id', userId)

  if (error) {
    console.error('[getUserWorkspaces] Erreur:', error)
    throw error
  }

  return (data || []).map(wu => ({
    ...wu.workspaces,
    role: wu.role
  }))
}
