import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = 'neoflowagency05@gmail.com'

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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifie')

    // Only admin can access this endpoint
    if (user.email !== ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ error: 'Acces refuse' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch all users
    const { data: { users: allUsers }, error: usersError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    })
    if (usersError) throw usersError

    // Fetch all workspaces
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: false })
    if (wsError) throw wsError

    // Fetch all workspace_users for membership info
    const { data: workspaceUsers, error: wuError } = await supabase
      .from('workspace_users')
      .select('workspace_id, user_id, role, created_at')
    if (wuError) throw wuError

    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, onboarding_completed, created_at, deleted_at')
    if (profilesError) throw profilesError

    // Build user data with workspace counts
    const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || [])
    const userWorkspaceCounts = new Map<string, number>()
    workspaceUsers?.forEach((wu: any) => {
      userWorkspaceCounts.set(wu.user_id, (userWorkspaceCounts.get(wu.user_id) || 0) + 1)
    })

    const users = allUsers?.map((u: any) => {
      const profile = profileMap.get(u.id)
      return {
        id: u.id,
        email: u.email,
        full_name: profile?.full_name || u.user_metadata?.full_name || '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        workspace_count: userWorkspaceCounts.get(u.id) || 0,
        onboarding_completed: profile?.onboarding_completed || false,
        deleted_at: profile?.deleted_at || null,
      }
    }) || []

    // Build workspace data with owner info
    const workspaceData = workspaces?.map((ws: any) => {
      const ownerUser = allUsers?.find((u: any) => u.id === ws.owner_user_id)
      const members = workspaceUsers?.filter((wu: any) => wu.workspace_id === ws.id) || []
      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        owner_email: ownerUser?.email || '',
        owner_name: ownerUser?.user_metadata?.full_name || '',
        plan_type: ws.plan_type || 'standard',
        subscription_status: ws.subscription_status,
        is_active: ws.is_active,
        stripe_customer_id: ws.stripe_customer_id,
        stripe_payment_intent_id: ws.stripe_payment_intent_id,
        member_count: members.length,
        created_at: ws.created_at,
      }
    }) || []

    // Compute stats
    const totalUsers = users.filter((u: any) => !u.deleted_at).length
    const totalWorkspaces = workspaceData.length
    const earlyAccessPaid = workspaceData.filter(
      (ws: any) => ws.plan_type === 'early-access' && ws.subscription_status === 'early_access'
    ).length
    const earlyAccessTotal = workspaceData.filter(
      (ws: any) => ws.plan_type === 'early-access'
    ).length

    return new Response(
      JSON.stringify({
        stats: {
          totalUsers,
          totalWorkspaces,
          earlyAccessPaid,
          earlyAccessTotal,
        },
        users,
        workspaces: workspaceData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[admin-data] Error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
