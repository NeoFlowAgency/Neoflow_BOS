import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'

export function usePermissions() {
  const { currentWorkspace } = useWorkspace()
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadRole = async () => {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !currentWorkspace?.id || cancelled) {
          setRole(null)
          return
        }

        const { data } = await supabase
          .from('workspace_users')
          .select('role')
          .eq('user_id', user.id)
          .eq('workspace_id', currentWorkspace.id)
          .single()

        if (!cancelled) {
          setRole(data?.role || null)
        }
      } catch (err) {
        console.error('[usePermissions] Error:', err.message)
        if (!cancelled) setRole(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRole()
    return () => { cancelled = true }
  }, [currentWorkspace?.id])

  return {
    role,
    loading,
    isAdmin: role === 'admin',
    isManager: role === 'manager' || role === 'admin',
    canEdit: role === 'admin' || role === 'manager'
  }
}
