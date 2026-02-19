import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext'
import { ToastProvider } from './contexts/ToastContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import CreerFacture from './pages/CreerFacture'
import ApercuFacture from './pages/ApercuFacture'
import ListeFactures from './pages/ListeFactures'
import CreerDevis from './pages/CreerDevis'
import ListeDevis from './pages/ListeDevis'
import ApercuDevis from './pages/ApercuDevis'
import ListeClients from './pages/ListeClients'
import FicheClient from './pages/FicheClient'
import Produits from './pages/Produits'
import Livraisons from './pages/Livraisons'
import DashboardFinancier from './pages/DashboardFinancier'
import Settings from './pages/Settings'
import WorkspaceOnboarding from './pages/WorkspaceOnboarding'
import WorkspaceSuspended from './pages/WorkspaceSuspended'
import JoinWorkspace from './pages/JoinWorkspace'
import MentionsLegales from './pages/MentionsLegales'
import Sidebar from './components/Sidebar'
import BackgroundPattern from './components/ui/BackgroundPattern'

function ProtectedRoute({ children, requireWorkspace = true, allowSuspended = false }) {
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState(null)
  const { currentWorkspace, loading: wsLoading } = useWorkspace()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (authLoading || (requireWorkspace && wsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent"></div>
          <p className="text-[#040741] font-medium">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requireWorkspace && !currentWorkspace) {
    return <Navigate to="/onboarding/workspace" replace />
  }

  if (requireWorkspace && currentWorkspace && !currentWorkspace.is_active && !allowSuspended) {
    return <Navigate to="/workspace/suspended" replace />
  }

  return children
}

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile and set initial sidebar state
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) {
        setSidebarOpen(false)
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <BackgroundPattern />
      <main
        className={`min-h-screen overflow-y-auto relative z-10 transition-all duration-300 ${
          isMobile
            ? 'ml-0 pt-16'
            : sidebarOpen ? 'ml-[240px]' : 'ml-[80px]'
        }`}
      >
        {children}
      </main>
    </div>
  )
}

function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
            <Route path="/dashboard" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
            <Route path="/factures/nouvelle" element={<ProtectedLayout><CreerFacture /></ProtectedLayout>} />
            <Route path="/factures/:factureId" element={<ProtectedLayout><ApercuFacture /></ProtectedLayout>} />
            <Route path="/factures" element={<ProtectedLayout><ListeFactures /></ProtectedLayout>} />
            <Route path="/devis/nouveau" element={<ProtectedLayout><CreerDevis /></ProtectedLayout>} />
            <Route path="/devis/:devisId" element={<ProtectedLayout><ApercuDevis /></ProtectedLayout>} />
            <Route path="/devis" element={<ProtectedLayout><ListeDevis /></ProtectedLayout>} />
            <Route path="/clients/:clientId" element={<ProtectedLayout><FicheClient /></ProtectedLayout>} />
            <Route path="/clients" element={<ProtectedLayout><ListeClients /></ProtectedLayout>} />
            <Route path="/produits" element={<ProtectedLayout><Produits /></ProtectedLayout>} />
            <Route path="/livraisons" element={<ProtectedLayout><Livraisons /></ProtectedLayout>} />
            <Route path="/dashboard-financier" element={<ProtectedLayout><DashboardFinancier /></ProtectedLayout>} />
            <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
            <Route
              path="/onboarding/workspace"
              element={
                <ProtectedRoute requireWorkspace={false}>
                  <WorkspaceOnboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/workspace/suspended"
              element={
                <ProtectedRoute requireWorkspace={true} allowSuspended={true}>
                  <WorkspaceSuspended />
                </ProtectedRoute>
              }
            />
            <Route path="/join" element={<JoinWorkspace />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </WorkspaceProvider>
    </BrowserRouter>
  )
}

export default App
