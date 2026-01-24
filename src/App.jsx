import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CreerDevis from './pages/CreerDevis'
import ApercuDevis from './pages/ApercuDevis'
import ListeDevis from './pages/ListeDevis'
import Livraisons from './pages/Livraisons'
import Sidebar from './components/Sidebar'
import BackgroundPattern from './components/ui/BackgroundPattern'

function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
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

  return children
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <Sidebar />
      <BackgroundPattern />
      <main className="ml-[240px] min-h-screen overflow-y-auto relative z-10">
        {children}
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
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
          path="/creer-devis"
          element={
            <ProtectedRoute>
              <Layout>
                <CreerDevis />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/apercu-devis/:devisId"
          element={
            <ProtectedRoute>
              <Layout>
                <ApercuDevis />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/devis"
          element={
            <ProtectedRoute>
              <Layout>
                <ListeDevis />
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
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
