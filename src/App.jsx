import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CreerFacture from './pages/CreerFacture'
import ApercuFacture from './pages/ApercuFacture'
import ListeFactures from './pages/ListeFactures'
import Livraisons from './pages/Livraisons'
import DashboardFinancier from './pages/DashboardFinancier'
import WorkspaceOnboarding from './pages/WorkspaceOnboarding'
import Sidebar from './components/Sidebar'
import BackgroundPattern from './components/ui/BackgroundPattern'

function ProtectedRoute({ children, requireWorkspace = true }) {
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

function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/factures/nouvelle"
            element={
              <ProtectedRoute>
                <Layout>
                  <CreerFacture />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/factures/:factureId"
            element={
              <ProtectedRoute>
                <Layout>
                  <ApercuFacture />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/factures"
            element={
              <ProtectedRoute>
                <Layout>
                  <ListeFactures />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/livraisons"
            element={
              <ProtectedRoute>
                <Layout>
                  <Livraisons />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard-financier"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardFinancier />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding/workspace"
            element={
              <ProtectedRoute requireWorkspace={false}>
                <WorkspaceOnboarding />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </WorkspaceProvider>
    </BrowserRouter>
  )
}

export default App
