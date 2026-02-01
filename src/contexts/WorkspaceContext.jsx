import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getUserWorkspaces } from '../services/workspaceService'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([])
  const [currentWorkspace, setCurrentWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadWorkspaces = async (uid) => {
    try {
      setLoading(true)
      const data = await getUserWorkspaces(uid)
      setWorkspaces(data)

      const savedId = localStorage.getItem('current_workspace_id')
      let ws = savedId ? data.find(w => w.id === savedId) : null
      if (!ws && data.length > 0) ws = data[0]

      setCurrentWorkspace(ws || null)
      if (ws) localStorage.setItem('current_workspace_id', ws.id)
    } catch (err) {
      console.error('Erreur chargement workspaces:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadWorkspaces(session.user.id)
      } else {
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
      loading,
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
