import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(token)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non authentifie')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const userToken = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(userToken)
    if (userError || !user) throw new Error('Non authentifie')

    const { token } = await req.json()
    if (!token) throw new Error('Token requis')

    // Hash the token and look it up
    const tokenHash = await hashToken(token)

    const { data: invitation, error: invError } = await supabase
      .from('workspace_invitations')
      .select('id, workspace_id, role, email, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .single()

    if (invError || !invitation) {
      throw new Error('Invitation invalide ou deja utilisee')
    }

    // Check if already used
    if (invitation.used_at) {
      throw new Error('Cette invitation a deja ete utilisee')
    }

    // Check expiry
    if (new Date(invitation.expires_at) < new Date()) {
      throw new Error('Cette invitation a expire')
    }

    // Check email restriction
    if (invitation.email && invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
      throw new Error('Cette invitation est reservee a une autre adresse email')
    }

    // Check workspace is active
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name, is_active')
      .eq('id', invitation.workspace_id)
      .single()

    if (!workspace) {
      throw new Error('Workspace introuvable')
    }

    if (!workspace.is_active) {
      throw new Error('Ce workspace est actuellement suspendu')
    }

    // Check if user is already a member
    const { data: existing } = await supabase
      .from('workspace_users')
      .select('id')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', user.id)
      .single()

    if (existing) {
      throw new Error('Vous etes deja membre de ce workspace')
    }

    // Add user to workspace
    const { error: joinError } = await supabase
      .from('workspace_users')
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: user.id,
        role: invitation.role,
      })

    if (joinError) {
      console.error('[accept-invitation] Join error:', joinError)
      throw new Error('Impossible de rejoindre le workspace')
    }

    // Mark invitation as used
    await supabase
      .from('workspace_invitations')
      .update({ used_at: new Date().toISOString(), used_by: user.id })
      .eq('id', invitation.id)

    console.log(`[accept-invitation] User ${user.id} joined workspace ${workspace.id} as ${invitation.role}`)

    return new Response(
      JSON.stringify({
        success: true,
        workspace: { id: workspace.id, name: workspace.name },
        role: invitation.role,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[accept-invitation] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
