import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getUserWorkspaces } from '../services/workspaceService'

const WorkspaceContext = createContext(null)

// Résout le plan effectif (rétrocompatibilité 'standard' → 'pro')
function resolvePlan(planType) {
  if (planType === 'standard') return 'pro'
  if (['basic', 'pro', 'enterprise', 'early-access'].includes(planType)) return planType
  return 'basic'
}

export function WorkspaceProvider({ children }) {
  const [workspaces, setWorkspaces] = useState([])
  const [currentWorkspace, setCurrentWorkspace] = useState(null)
  const [neoCredits, setNeoCredits] = useState(null) // { credits_balance, monthly_allowance, credits_used_this_month }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const loadedRef = useRef(false)

  const loadNeoCredits = useCallback(async (workspaceId) => {
    if (!workspaceId) return
    try {
      const { data } = await supabase
        .from('neo_credits')
        .select('credits_balance, monthly_allowance, credits_used_this_month, extra_credits, last_reset_at')
        .eq('workspace_id', workspaceId)
        .single()
      setNeoCredits(data || null)
    } catch {
      setNeoCredits(null)
    }
  }, [])

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
      if (ws) {
        localStorage.setItem('current_workspace_id', ws.id)
        await loadNeoCredits(ws.id)
      }
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !loadedRef.current) {
        loadedRef.current = true
        loadWorkspaces(session.user.id)
      } else if (!session) {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user && !loadedRef.current) {
          loadedRef.current = true
          loadWorkspaces(session.user.id)
        }
      } else if (event === 'SIGNED_OUT') {
        loadedRef.current = false
        setWorkspaces([])
        setCurrentWorkspace(null)
        setNeoCredits(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const switchWorkspace = async (workspaceId) => {
    const ws = workspaces.find(w => w.id === workspaceId)
    if (ws) {
      setCurrentWorkspace(ws)
      setNeoCredits(null)
      localStorage.setItem('current_workspace_id', workspaceId)
      await loadNeoCredits(workspaceId)
    }
  }

  const refreshWorkspaces = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await loadWorkspaces(user.id)
  }

  const refreshNeoCredits = useCallback(() => {
    if (currentWorkspace?.id) loadNeoCredits(currentWorkspace.id)
  }, [currentWorkspace?.id, loadNeoCredits])

  // Plan effectif (normalise 'standard' → 'pro')
  const effectivePlan = resolvePlan(currentWorkspace?.plan_type)

  // Helpers plan
  const isEnterprise = effectivePlan === 'enterprise'
  const isPro = effectivePlan === 'pro' || effectivePlan === 'early-access' || isEnterprise
  const isBasic = effectivePlan === 'basic'

  // NeoCredits helpers
  const neoCreditsBalance = neoCredits?.monthly_allowance === -1 ? Infinity : (neoCredits?.credits_balance ?? 0)
  const hasNeoCredits = neoCredits?.monthly_allowance === -1 || neoCreditsBalance > 0
  const isUnlimitedCredits = neoCredits?.monthly_allowance === -1

  // Modules activés
  const isModuleEnabled = (key) => {
    const modules = currentWorkspace?.modules
    if (!modules) return true
    return modules[key] === true
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
      planType: effectivePlan,
      isBasic,
      isPro,
      isEnterprise,
      // NeoCredits
      neoCredits,
      neoCreditsBalance,
      hasNeoCredits,
      isUnlimitedCredits,
      refreshNeoCredits,
      loading,
      error,
      switchWorkspace,
      refreshWorkspaces,
      isModuleEnabled,
      modules: currentWorkspace?.modules ?? {},
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
