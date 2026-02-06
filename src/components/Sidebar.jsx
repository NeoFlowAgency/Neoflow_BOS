import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'

export default function Sidebar({ isOpen, setIsOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)
  const { workspaces, currentWorkspace, switchWorkspace } = useWorkspace()
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const wsDropdownRef = useRef(null)

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

  // Close workspace dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target)) {
        setWsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const NavItem = ({ to, icon, label, end }) => (
    <NavLink
      to={to}
      end={end}
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

        {/* Workspace Selector */}
        {workspaces.length > 0 && (
          <div className="mb-4 relative" ref={wsDropdownRef}>
            {(isOpen || isMobile) ? (
              <button
                onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-white/10 hover:bg-white/15 rounded-xl text-white transition-colors"
              >
                <div className="w-8 h-8 bg-[#313ADF] rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold">
                  {currentWorkspace?.name?.charAt(0)?.toUpperCase() || 'W'}
                </div>
                <span className="text-sm font-medium truncate flex-1 text-left">
                  {currentWorkspace?.name || 'Workspace'}
                </span>
                <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${wsDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
                className="w-full flex items-center justify-center p-2 bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
                title={currentWorkspace?.name || 'Workspace'}
              >
                <div className="w-8 h-8 bg-[#313ADF] rounded-lg flex items-center justify-center text-white text-sm font-bold">
                  {currentWorkspace?.name?.charAt(0)?.toUpperCase() || 'W'}
                </div>
              </button>
            )}

            {wsDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Workspaces
                </p>
                {workspaces.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      switchWorkspace(ws.id)
                      setWsDropdownOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                      ws.id === currentWorkspace?.id ? 'bg-[#313ADF]/5' : ''
                    }`}
                  >
                    <div className="w-7 h-7 bg-[#313ADF]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-[#313ADF]">
                        {ws.name?.charAt(0)?.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#040741] truncate">{ws.name}</p>
                      <p className="text-xs text-gray-400">{ws.role}</p>
                    </div>
                    {ws.id === currentWorkspace?.id && (
                      <svg className="w-4 h-4 text-[#313ADF] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
                <hr className="my-1" />
                <button
                  onClick={() => {
                    setWsDropdownOpen(false)
                    navigate('/onboarding/workspace')
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-[#313ADF] hover:bg-[#313ADF]/5 transition-colors"
                >
                  <div className="w-7 h-7 bg-[#313ADF]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">Nouveau workspace</span>
                </button>
              </div>
            )}
          </div>
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
            to="/factures/nouvelle"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
            label="Nouvelle facture"
          />
          <NavItem
            to="/factures"
            end
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            label="Mes factures"
          />
          <NavItem
            to="/devis"
            end
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            }
            label="Mes devis"
          />
          <NavItem
            to="/clients"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
            label="Clients"
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
