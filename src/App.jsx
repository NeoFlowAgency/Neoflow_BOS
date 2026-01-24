import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import CreerDevis from './pages/CreerDevis'
import ApercuDevis from './pages/ApercuDevis'
import ListeDevis from './pages/ListeDevis'
import Livraisons from './pages/Livraisons'
import Sidebar from './components/Sidebar'

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
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#1e1b4b] border-t-transparent"></div>
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
      {/* Forme décorative bleue - exactement comme le design */}
      <div className="fixed right-0 top-0 bottom-0 w-[280px] pointer-events-none z-0 overflow-hidden">
        <svg
          viewBox="0 0 280 800"
          className="absolute right-0 top-0 h-full w-full"
          preserveAspectRatio="xMaxYMid slice"
        >
          {/* Couche bleue claire (derrière) */}
          <path
            d="M280,0 L280,800 L180,800
               C120,720 140,640 100,560
               C60,480 100,400 140,320
               C180,240 120,160 160,80
               C180,40 200,0 220,0 Z"
            fill="#3b82f6"
          />
          {/* Couche bleu marine (devant) */}
          <path
            d="M280,0 L280,800 L220,800
               C180,700 200,620 160,540
               C120,460 180,380 200,300
               C220,220 180,140 210,60
               C230,20 250,0 280,0 Z"
            fill="#1e1b4b"
          />
        </svg>
      </div>
      <main className="ml-[200px] min-h-screen overflow-y-auto relative z-10 pr-[100px]">
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
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
