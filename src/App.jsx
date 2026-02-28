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
import VenteRapide from './pages/VenteRapide'
import CreerCommande from './pages/CreerCommande'
import ListeCommandes from './pages/ListeCommandes'
import ApercuCommande from './pages/ApercuCommande'
import Stock from './pages/Stock'
import StockLocations from './pages/StockLocations'
import Fournisseurs from './pages/Fournisseurs'
import FicheFournisseur from './pages/FicheFournisseur'
import CreerBonCommande from './pages/CreerBonCommande'
import ApercuBonCommande from './pages/ApercuBonCommande'
import Livraisons from './pages/Livraisons'
import Documentation from './pages/Documentation'
import DocumentationAdmin from './pages/DocumentationAdmin'
import DashboardFinancier from './pages/DashboardFinancier'
import Settings from './pages/Settings'
import WorkspaceOnboarding from './pages/WorkspaceOnboarding'
import WorkspaceSuspended from './pages/WorkspaceSuspended'
import JoinWorkspace from './pages/JoinWorkspace'
import WorkspaceChoice from './pages/WorkspaceChoice'
import MentionsLegales from './pages/MentionsLegales'
import AdminDashboard from './pages/AdminDashboard'
import Sidebar from './components/Sidebar'
import BackgroundPattern from './components/ui/BackgroundPattern'
import OnboardingTour from './components/OnboardingTour'
import NeoButton from './components/NeoButton'

// Internal admin email — bypass Stripe/active check
const ADMIN_EMAIL = 'neoflowagency05@gmail.com'
const DEV_EMAIL = 'gnoakim05@gmail.com'
const isInternalUser = (email) => email === ADMIN_EMAIL || email === DEV_EMAIL

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
    return <Navigate to="/onboarding/choice" replace />
  }

  if (requireWorkspace && currentWorkspace && !currentWorkspace.is_active && !allowSuspended && !isInternalUser(user?.email)) {
    return <Navigate to="/workspace/suspended" replace />
  }

  return children
}

function RoleGuard({ children, allowedRoles }) {
  const { role } = useWorkspace()
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

const BUSINESS_ROLES = ['proprietaire', 'manager', 'vendeur', 'livreur']
const SALES_ROLES = ['proprietaire', 'manager', 'vendeur']
const MANAGEMENT_ROLES = ['proprietaire', 'manager']

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setSidebarOpen(false)
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
      <OnboardingTour />
      <NeoButton />
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
            <Route path="/vente-rapide" element={<ProtectedLayout><RoleGuard allowedRoles={SALES_ROLES}><VenteRapide /></RoleGuard></ProtectedLayout>} />
            <Route path="/commandes/nouvelle" element={<ProtectedLayout><RoleGuard allowedRoles={SALES_ROLES}><CreerCommande /></RoleGuard></ProtectedLayout>} />
            <Route path="/commandes/:commandeId" element={<ProtectedLayout><RoleGuard allowedRoles={SALES_ROLES}><ApercuCommande /></RoleGuard></ProtectedLayout>} />
            <Route path="/commandes" element={<ProtectedLayout><RoleGuard allowedRoles={SALES_ROLES}><ListeCommandes /></RoleGuard></ProtectedLayout>} />
            <Route path="/factures/nouvelle" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><CreerFacture /></RoleGuard></ProtectedLayout>} />
            <Route path="/factures/:factureId" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><ApercuFacture /></RoleGuard></ProtectedLayout>} />
            <Route path="/factures" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><ListeFactures /></RoleGuard></ProtectedLayout>} />
            <Route path="/devis/nouveau" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><CreerDevis /></RoleGuard></ProtectedLayout>} />
            <Route path="/devis/:devisId" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><ApercuDevis /></RoleGuard></ProtectedLayout>} />
            <Route path="/devis" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><ListeDevis /></RoleGuard></ProtectedLayout>} />
            <Route path="/clients/:clientId" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><FicheClient /></RoleGuard></ProtectedLayout>} />
            <Route path="/clients" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><ListeClients /></RoleGuard></ProtectedLayout>} />
            <Route path="/produits" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><Produits /></RoleGuard></ProtectedLayout>} />
            <Route path="/stock/emplacements" element={<ProtectedLayout><RoleGuard allowedRoles={MANAGEMENT_ROLES}><StockLocations /></RoleGuard></ProtectedLayout>} />
            <Route path="/stock" element={<ProtectedLayout><Stock /></ProtectedLayout>} />
            <Route path="/fournisseurs/:fournisseurId" element={<ProtectedLayout><RoleGuard allowedRoles={MANAGEMENT_ROLES}><FicheFournisseur /></RoleGuard></ProtectedLayout>} />
            <Route path="/fournisseurs" element={<ProtectedLayout><RoleGuard allowedRoles={MANAGEMENT_ROLES}><Fournisseurs /></RoleGuard></ProtectedLayout>} />
            <Route path="/bons-commande/nouveau" element={<ProtectedLayout><RoleGuard allowedRoles={MANAGEMENT_ROLES}><CreerBonCommande /></RoleGuard></ProtectedLayout>} />
            <Route path="/bons-commande/:bonCommandeId" element={<ProtectedLayout><RoleGuard allowedRoles={MANAGEMENT_ROLES}><ApercuBonCommande /></RoleGuard></ProtectedLayout>} />
            <Route path="/livraisons" element={<ProtectedLayout><Livraisons /></ProtectedLayout>} />
            <Route path="/dashboard-financier" element={<ProtectedLayout><RoleGuard allowedRoles={BUSINESS_ROLES}><DashboardFinancier /></RoleGuard></ProtectedLayout>} />
            <Route path="/documentation/admin" element={<ProtectedLayout><RoleGuard allowedRoles={['proprietaire']}><DocumentationAdmin /></RoleGuard></ProtectedLayout>} />
            <Route path="/documentation" element={<ProtectedLayout><Documentation /></ProtectedLayout>} />
            <Route path="/settings" element={<ProtectedLayout><Settings /></ProtectedLayout>} />
            <Route path="/admin" element={<ProtectedLayout><AdminDashboard /></ProtectedLayout>} />
            <Route
              path="/onboarding/choice"
              element={
                <ProtectedRoute requireWorkspace={false}>
                  <WorkspaceChoice />
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
