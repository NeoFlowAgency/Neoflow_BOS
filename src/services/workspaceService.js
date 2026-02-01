import { supabase } from '../lib/supabase'

export const createWorkspace = async (name, userId) => {
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ name })
    .select()
    .single()

  if (wsError) throw wsError

  const { error: userError } = await supabase
    .from('workspace_users')
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: 'admin'
    })

  // 23505 = unique_violation (user already in this workspace) - safe to ignore
  if (userError && userError.code !== '23505') throw userError

  return workspace
}

export const getUserWorkspaces = async (userId) => {
  const { data, error } = await supabase
    .from('workspace_users')
    .select('workspace_id, role, workspaces(*)')
    .eq('user_id', userId)

  if (error) throw error
  return data.map(wu => ({ ...wu.workspaces, role: wu.role }))
}
