import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) throw new Error('Non authentifie')

    const body = await req.json()
    const { action, transfer_to, workspace_id } = body
    console.log(`[delete-account] User: ${user.id}, Body:`, JSON.stringify(body))

    // Find workspaces where user is owner
    const { data: ownedWorkspaces } = await supabase
      .from('workspace_users')
      .select('workspace_id, workspaces(id, name, stripe_subscription_id)')
      .eq('user_id', user.id)
      .eq('role', 'owner')

    const owned = (ownedWorkspaces || []).map(wu => wu.workspaces).filter(Boolean)
    console.log(`[delete-account] Owned workspaces: ${owned.length}, action: ${action || 'none'}`)

    // If user owns workspaces and no action specified, return what needs to be resolved
    if (owned.length > 0 && !action) {
      // Get members for each owned workspace (for transfer options)
      const workspacesWithMembers = []
      for (const ws of owned) {
        const { data: members } = await supabase
          .from('workspace_users')
          .select('user_id, role')
          .eq('workspace_id', ws.id)
          .neq('user_id', user.id)

        // Get profile names separately to avoid FK join issues
        const memberList = []
        for (const m of (members || [])) {
          let fullName = null
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', m.user_id)
              .single()
            fullName = profile?.full_name || null
          } catch {
            // profiles table might not exist, skip
          }
          memberList.push({
            user_id: m.user_id,
            role: m.role,
            full_name: fullName,
          })
        }

        workspacesWithMembers.push({
          id: ws.id,
          name: ws.name,
          members: memberList,
        })
      }

      return new Response(
        JSON.stringify({
          requires_action: true,
          owned_workspaces: workspacesWithMembers,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle owned workspaces
    if (owned.length > 0) {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: '2024-04-10' }) : null

      for (const ws of owned) {
        if (action === 'transfer' && transfer_to && workspace_id === ws.id) {
          // Transfer ownership
          await supabase
            .from('workspace_users')
            .update({ role: 'owner' })
            .eq('workspace_id', ws.id)
            .eq('user_id', transfer_to)

          await supabase
            .from('workspaces')
            .update({ owner_user_id: transfer_to })
            .eq('id', ws.id)

          console.log(`[delete-account] Transferred ownership of ${ws.id} to ${transfer_to}`)
        } else if (action === 'delete_workspace') {
          // Cancel Stripe subscription if active
          if (ws.stripe_subscription_id && stripe) {
            try {
              await stripe.subscriptions.cancel(ws.stripe_subscription_id)
              console.log(`[delete-account] Canceled subscription ${ws.stripe_subscription_id}`)
            } catch (err: unknown) {
              console.error(`[delete-account] Failed to cancel subscription:`, (err as Error).message)
            }
          }

          // Deactivate workspace and clear owner_user_id FK reference
          await supabase
            .from('workspaces')
            .update({
              is_active: false,
              subscription_status: 'canceled',
              owner_user_id: null,
            })
            .eq('id', ws.id)

          console.log(`[delete-account] Deactivated workspace ${ws.id}`)
        }
      }
    }

    // Remove user from all workspace_users
    const { error: wuDeleteError } = await supabase
      .from('workspace_users')
      .delete()
      .eq('user_id', user.id)
    if (wuDeleteError) {
      console.error('[delete-account] workspace_users delete error:', wuDeleteError.message)
    } else {
      console.log('[delete-account] Removed user from all workspace_users')
    }

    // Clean up all FK references to auth.users BEFORE deleting the auth user
    // 1. workspace_invitations.invited_by (NOT NULL) → delete rows
    const { error: invDeleteErr } = await supabase
      .from('workspace_invitations')
      .delete()
      .eq('invited_by', user.id)
    if (invDeleteErr) {
      console.error('[delete-account] invitations delete error:', invDeleteErr.message)
    } else {
      console.log('[delete-account] Deleted invitations created by user')
    }

    // 2. workspace_invitations.used_by (nullable) → set to null
    const { error: invUsedErr } = await supabase
      .from('workspace_invitations')
      .update({ used_by: null })
      .eq('used_by', user.id)
    if (invUsedErr) {
      console.error('[delete-account] invitations used_by cleanup error:', invUsedErr.message)
    }

    // 3. bug_reports.user_id (NOT NULL) → delete rows
    const { error: bugDeleteErr } = await supabase
      .from('bug_reports')
      .delete()
      .eq('user_id', user.id)
    if (bugDeleteErr) {
      console.error('[delete-account] bug_reports delete error:', bugDeleteErr.message)
    } else {
      console.log('[delete-account] Deleted bug reports by user')
    }

    // 4. workspaces.owner_user_id → clear for any remaining owned workspaces
    const { error: ownerClearErr } = await supabase
      .from('workspaces')
      .update({ owner_user_id: null })
      .eq('owner_user_id', user.id)
    if (ownerClearErr) {
      console.error('[delete-account] owner_user_id cleanup error:', ownerClearErr.message)
    } else {
      console.log('[delete-account] Cleared owner_user_id references')
    }

    // profiles table has ON DELETE CASCADE from auth.users, so it will be auto-deleted
    // But soft-delete first for any audit trail before CASCADE removes it
    try {
      await supabase
        .from('profiles')
        .update({
          full_name: '[Compte supprimé]',
          deleted_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      console.log('[delete-account] Profile soft-deleted (will be cascade-deleted with auth user)')
    } catch {
      // profiles table might not exist
    }

    // Delete auth user - try JS client first, fallback to REST API
    let authDeleted = false

    // Method 1: Supabase JS client admin API
    try {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id)
      if (deleteUserError) {
        console.error('[delete-account] JS client deleteUser failed:', deleteUserError.message)
      } else {
        authDeleted = true
        console.log('[delete-account] Auth user deleted via JS client')
      }
    } catch (err: unknown) {
      console.error('[delete-account] JS client deleteUser exception:', (err as Error).message)
    }

    // Method 2: Direct REST API (fallback)
    if (!authDeleted) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json',
        },
      })

      if (!deleteRes.ok) {
        const errorBody = await deleteRes.text()
        console.error('[delete-account] REST API delete failed:', deleteRes.status, errorBody)
        throw new Error('Erreur lors de la suppression du compte utilisateur')
      }
      console.log('[delete-account] Auth user deleted via REST API')
    }

    console.log(`[delete-account] Account deleted: ${user.id}`)

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error('[delete-account] Error:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
