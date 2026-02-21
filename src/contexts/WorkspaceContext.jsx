import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getUserWorkspaces } from '../services/workspaceService'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([])
  const [currentWorkspace, setCurrentWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  const loadWorkspaces = async (uid) => {
    try {
      setLoading(true)
      setError(null)
      const data = await getUserWorkspaces(uid)
      setWorkspaces(data)

      const savedId = localStorage.getItem('current_workspace_id')
      let ws = savedId ? data.find(w => w.id === savedId) : null
      if (!ws && data.length > 0) ws = data[0]

      setCurrentWorkspace(ws || null)
      if (ws) localStorage.setItem('current_workspace_id', ws.id)
    } catch (err) {
      console.error('[WorkspaceContext] Erreur chargement workspaces:', err.message)
      setError(err.message)
      setWorkspaces([])
      setCurrentWorkspace(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !loadedRef.current) {
        loadedRef.current = true
        loadWorkspaces(session.user.id)
      } else if (!session) {
        setLoading(false)
      }
    })

    // Listen for auth changes - only reload on meaningful events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Token refresh should NOT trigger a full reload - this preserves page state
        // when the user switches tabs or the token auto-refreshes
        return
      }
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user && !loadedRef.current) {
          loadedRef.current = true
          loadWorkspaces(session.user.id)
        }
      } else if (event === 'SIGNED_OUT') {
        loadedRef.current = false
        setWorkspaces([])
        setCurrentWorkspace(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const switchWorkspace = (workspaceId) => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (ws) {
      setCurrentWorkspace(ws)
      localStorage.setItem('current_workspace_id', workspaceId)
    }
  }

  const refreshWorkspaces = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await loadWorkspaces(user.id)
  }

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      currentWorkspace,
      workspace: currentWorkspace,
      role: currentWorkspace?.role,
      isOwner: currentWorkspace?.role === 'proprietaire',
      isAdmin: currentWorkspace?.role === 'manager' || currentWorkspace?.role === 'proprietaire',
      isVendeur: currentWorkspace?.role === 'vendeur',
      isLivreur: currentWorkspace?.role === 'livreur',
      isActive: currentWorkspace?.is_active ?? false,
      subscriptionStatus: currentWorkspace?.subscription_status ?? 'incomplete',
      loading,
      error,
      switchWorkspace,
      refreshWorkspaces
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace doit être utilisé dans un WorkspaceProvider')
  }
  return context
}
