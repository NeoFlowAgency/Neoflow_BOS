import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Sidebar({ isOpen, setIsOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false)
    }
  }, [location.pathname, isMobile, setIsOpen])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const NavItem = ({ to, icon, label }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
          isActive
            ? 'bg-[#313ADF] text-white shadow-lg'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        } ${!isOpen && !isMobile ? 'justify-center' : ''}`
      }
      title={!isOpen ? label : ''}
    >
      <span className="flex-shrink-0">{icon}</span>
      {(isOpen || isMobile) && <span>{label}</span>}
    </NavLink>
  )

  // Mobile hamburger button
  const MobileToggle = () => (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="md:hidden fixed top-4 left-4 z-50 p-2 bg-[#040741] text-white rounded-xl shadow-lg"
      aria-label="Toggle menu"
    >
      {isOpen ? (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
    </button>
  )

  // Desktop toggle button
  const DesktopToggle = () => (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="hidden md:flex absolute -right-3 top-20 w-6 h-6 bg-[#313ADF] text-white rounded-full items-center justify-center shadow-lg hover:bg-[#4149e8] transition-colors z-10"
      aria-label="Toggle sidebar"
    >
      <svg
        className={`w-4 h-4 transition-transform ${isOpen ? '' : 'rotate-180'}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  )

  return (
    <>
      {/* Mobile toggle button */}
      <MobileToggle />

      {/* Overlay for mobile */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-gradient-to-b from-[#040741] to-[#0a0b52] flex flex-col p-5 transition-all duration-300 z-40
          ${isMobile
            ? isOpen ? 'w-[280px] translate-x-0' : '-translate-x-full w-[280px]'
            : isOpen ? 'w-[240px]' : 'w-[80px]'
          }`}
      >
        {/* Desktop toggle */}
        <DesktopToggle />

        {/* Logo Neoflow Agency - 2 versions selon état sidebar */}
        <button
          onClick={() => navigate('/dashboard')}
          className={`mb-6 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all overflow-hidden ${
            isOpen || isMobile ? 'p-3' : 'p-2'
          }`}
        >
          {/* Logo complet quand sidebar ouverte */}
          {(isOpen || isMobile) && (
            <img
              src="/logo-neoflow-full.png"
              alt="Neoflow Agency"
              className="h-14 w-auto object-contain"
            />
          )}
          {/* Icône seule quand sidebar fermée */}
          {!isOpen && !isMobile && (
            <img
              src="/logo-neoflow-icon.png"
              alt="Neoflow Agency"
              className="h-10 w-10 object-contain"
            />
          )}
        </button>

        {/* Subtitle */}
        {(isOpen || isMobile) && (
          <p className="text-white/50 text-xs text-center mb-6 font-medium">
            Maison de la Literie
          </p>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          <NavItem
            to="/dashboard"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
            label="Accueil"
          />
          <NavItem
            to="/creer-devis"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
            label="Nouveau devis"
          />
          <NavItem
            to="/devis"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            label="Mes devis"
          />
          <NavItem
            to="/livraisons"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            label="Livraisons"
          />
          <NavItem
            to="/dashboard-financier"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
            label="Statistiques"
          />
        </nav>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-white/50 hover:text-white hover:bg-red-500/20 transition-all ${
            !isOpen && !isMobile ? 'justify-center' : ''
          }`}
          title={!isOpen ? 'Déconnexion' : ''}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {(isOpen || isMobile) && <span className="text-sm">Déconnexion</span>}
        </button>
      </aside>
    </>
  )
}
