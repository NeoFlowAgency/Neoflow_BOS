import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { supabase } from '../lib/supabase'
import { canManageSuppliers, canViewStatistics } from '../lib/permissions'

const ADMIN_EMAIL = 'neoflowagency05@gmail.com'
const isAdminUser = (email) => email === ADMIN_EMAIL

export default function Sidebar({ isOpen, setIsOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)
  const [userEmail, setUserEmail] = useState(null)
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const [ventesOpen, setVentesOpen] = useState(true)
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [bottomSheet, setBottomSheet] = useState(null) // 'ventes' | 'boutique' | null
  const [isFullscreen, setIsFullscreen] = useState(false)
  const wsDropdownRef = useRef(null)
  const { currentWorkspace, workspaces, switchWorkspace, role } = useWorkspace()

  // Auto-expand groups when on related routes
  const ventesRoutes = ['/vente-rapide', '/commandes', '/factures', '/devis']
  const catalogueRoutes = ['/produits', '/stock', '/fournisseurs']
  const isOnVentesRoute = ventesRoutes.some(r => location.pathname.startsWith(r))
  const isOnCatalogueRoute = catalogueRoutes.some(r => location.pathname.startsWith(r))

  useEffect(() => {
    if (isOnVentesRoute) setVentesOpen(true)
    if (isOnCatalogueRoute) setCatalogueOpen(true)
  }, [location.pathname])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || null)
    })
  }, [])

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile) {
      setIsOpen(false)
    }
  }, [location.pathname, isMobile, setIsOpen])

  // Close workspace dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target)) {
        setWsDropdownOpen(false)
      }
    }
    if (wsDropdownOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [wsDropdownOpen])

  // Close bottom sheet on navigation
  useEffect(() => {
    setBottomSheet(null)
  }, [location.pathname])

  // Track fullscreen state
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        document.documentElement.requestFullscreen()
      }
    } catch { /* not supported on iOS */ }
  }

  const NavItem = ({ to, icon, label, end, indent }) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all ${
          isActive
            ? 'bg-[#313ADF] text-white shadow-lg'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        } ${!isOpen && !isMobile ? 'justify-center' : ''} ${indent && (isOpen || isMobile) ? 'ml-4' : ''}`
      }
      title={!isOpen ? label : ''}
    >
      <span className="flex-shrink-0">{icon}</span>
      {(isOpen || isMobile) && <span className="text-sm">{label}</span>}
    </NavLink>
  )

  const NavGroup = ({ icon, label, isExpanded, onToggle, children }) => (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all text-white/70 hover:bg-white/10 hover:text-white ${
          !isOpen && !isMobile ? 'justify-center' : ''
        }`}
        title={!isOpen ? label : ''}
      >
        <span className="flex-shrink-0">{icon}</span>
        {(isOpen || isMobile) && (
          <>
            <span className="text-sm flex-1 text-left">{label}</span>
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>
      {isExpanded && (isOpen || isMobile) && (
        <div className="mt-1 space-y-1">
          {children}
        </div>
      )}
    </div>
  )

  const isVentesActive = ventesRoutes.some(r => location.pathname.startsWith(r))
  const isBoutiqueActive = catalogueRoutes.some(r => location.pathname.startsWith(r))

  const VENTES_SHEET = [
    { to: '/vente-rapide', label: 'Vente rapide', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
    { to: '/commandes',    label: 'Commandes',   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
    { to: '/factures',     label: 'Factures',    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    { to: '/devis',        label: 'Devis',       icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg> },
  ]

  const BOUTIQUE_SHEET = [
    { to: '/produits',     label: 'Produits',     show: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
    { to: '/stock',        label: 'Stock',        show: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg> },
    { to: '/fournisseurs', label: 'Fournisseurs', show: canManageSuppliers(role), icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
  ]

  const MobileBottomNav = () => (
    <>
      {/* Sheet backdrop */}
      {bottomSheet && (
        <div className="md:hidden fixed inset-0 z-[45]" onClick={() => setBottomSheet(null)} />
      )}

      {/* Sheet panel */}
      {bottomSheet && (
        <div
          className="md:hidden fixed left-0 right-0 z-[46] bg-gradient-to-b from-[#040741] to-[#0a0b52] border-t border-white/10 rounded-t-2xl shadow-2xl overflow-hidden"
          style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
        >
          {/* Drag handle */}
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1" />
          <p className="text-white/40 text-[11px] font-medium uppercase tracking-wider px-5 py-2">
            {bottomSheet === 'ventes' ? 'Ventes' : 'Boutique'}
          </p>
          <div className="px-3 pb-3 space-y-0.5">
            {(bottomSheet === 'ventes' ? VENTES_SHEET : BOUTIQUE_SHEET)
              .filter(item => item.show !== false)
              .map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setBottomSheet(null)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      isActive ? 'bg-[#313ADF] text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))
            }
          </div>
        </div>
      )}

      {/* Nav bar */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-[#040741] to-[#0a0b52] border-t border-white/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around py-1">

          {/* Ventes (expandable) */}
          <button
            onClick={() => setBottomSheet(s => s === 'ventes' ? null : 'ventes')}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] transition-colors ${
              isVentesActive || bottomSheet === 'ventes' ? 'text-white' : 'text-white/50'
            }`}
          >
            <span className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              {bottomSheet === 'ventes' && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#313ADF] rounded-full" />
              )}
            </span>
            <span className="text-[10px] font-medium">Ventes</span>
          </button>

          {/* Clients */}
          <NavLink
            to="/clients"
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] transition-colors ${isActive ? 'text-white' : 'text-white/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="text-[10px] font-medium">Clients</span>
          </NavLink>

          {/* Boutique (expandable: Produits, Stock, Fournisseurs) */}
          <button
            onClick={() => setBottomSheet(s => s === 'boutique' ? null : 'boutique')}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] transition-colors ${
              isBoutiqueActive || bottomSheet === 'boutique' ? 'text-white' : 'text-white/50'
            }`}
          >
            <span className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {bottomSheet === 'boutique' && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#313ADF] rounded-full" />
              )}
            </span>
            <span className="text-[10px] font-medium">Boutique</span>
          </button>

          {/* Neo IA */}
          <button
            onClick={() => { setBottomSheet(null); window.dispatchEvent(new CustomEvent('neoflow:open-neo')) }}
            className="flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] text-white/50 hover:text-white transition-colors"
          >
            <span className="relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-[#040741]" />
            </span>
            <span className="text-[10px] font-medium">Neo IA</span>
          </button>

          {/* Livraisons */}
          <NavLink
            to="/livraisons"
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] transition-colors ${isActive ? 'text-white' : 'text-white/50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="text-[10px] font-medium">Livraisons</span>
          </NavLink>

        </div>
      </div>
    </>
  )

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
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Boutons flottants mobile (haut-droit) : plein écran + accès sidebar complet */}
      {isMobile && !isOpen && (
        <div className="md:hidden fixed top-3 right-3 z-[45] flex gap-1.5">
          {/* Plein écran */}
          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-sm text-gray-500 rounded-xl shadow-sm border border-gray-200/60 hover:bg-white transition-colors"
            title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v5m0-5h5M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0h5m-5 0v-5M15 15l5 5m0 0h-5m5 0v-5" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
          {/* Menu complet (Dashboard, Paramètres, Stats) */}
          <button
            onClick={() => setIsOpen(true)}
            className="w-9 h-9 flex items-center justify-center bg-white/90 backdrop-blur-sm text-gray-500 rounded-xl shadow-sm border border-gray-200/60 hover:bg-white transition-colors"
            title="Menu complet"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      )}

      <aside
        className={`fixed left-0 top-0 h-screen bg-gradient-to-b from-[#040741] to-[#0a0b52] flex flex-col p-5 transition-all duration-300 z-40
          ${isMobile
            ? isOpen ? 'w-full translate-x-0' : '-translate-x-full w-full'
            : isOpen ? 'w-[240px]' : 'w-[80px]'
          }`}
      >
        <DesktopToggle />

        {/* Bouton fermer (mobile uniquement) */}
        {isMobile && (
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors z-10"
            aria-label="Fermer le menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Logo */}
        <button
          onClick={() => navigate('/dashboard')}
          className={`mb-6 bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all overflow-hidden ${
            isOpen || isMobile ? 'p-3' : 'p-2'
          }`}
        >
          {(isOpen || isMobile) && (
            <img src="/logo-neoflow-full.png" alt="Neoflow Agency" className="h-14 w-auto object-contain" />
          )}
          {!isOpen && !isMobile && (
            <img src="/logo-neoflow-icon.png" alt="Neoflow Agency" className="h-10 w-10 object-contain" />
          )}
        </button>

        {/* Workspace switcher */}
        {currentWorkspace && (isOpen || isMobile) && (
          <div className="mb-4 relative" ref={wsDropdownRef}>
            <button
              onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
              className="w-full px-3 py-2 bg-white/10 rounded-xl hover:bg-white/15 transition-colors text-left"
            >
              <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Workspace</p>
              <div className="flex items-center justify-between">
                <p className="text-white text-sm font-semibold truncate">{currentWorkspace.name}</p>
                <svg className={`w-4 h-4 text-white/50 transition-transform ${wsDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {wsDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#0a0b52] border border-white/20 rounded-xl shadow-xl z-50 overflow-hidden">
                {workspaces.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      switchWorkspace(ws.id)
                      setWsDropdownOpen(false)
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm transition-colors flex items-center gap-2 ${
                      ws.id === currentWorkspace.id
                        ? 'bg-[#313ADF] text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {ws.name?.charAt(0)?.toUpperCase()}
                    </span>
                    <span className="truncate">{ws.name}</span>
                  </button>
                ))}
                {/* Création workspace déplacée dans Settings > Workspace */}
              </div>
            )}
          </div>
        )}
        {currentWorkspace && !isOpen && !isMobile && (
          <button
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            className="mb-4 w-10 h-10 mx-auto bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/15 transition-colors"
            title={currentWorkspace.name}
          >
            <span className="text-white text-sm font-bold">{currentWorkspace.name?.charAt(0)?.toUpperCase()}</span>
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {/* Accueil */}
          <NavItem
            to="/dashboard"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
            label="Accueil"
          />

          {/* Ventes (groupe depliable) */}
          <NavGroup
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            }
            label="Ventes"
            isExpanded={ventesOpen}
            onToggle={() => setVentesOpen(!ventesOpen)}
          >
            <NavItem
              to="/vente-rapide"
              indent
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
              label="Vente rapide"
            />
            <NavItem
              to="/commandes"
              end
              indent
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              }
              label="Commandes"
            />
            <NavItem
              to="/factures"
              end
              indent
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              label="Factures"
            />
            <NavItem
              to="/devis"
              end
              indent
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              }
              label="Devis"
            />
          </NavGroup>

          {/* Clients */}
          <NavItem
            to="/clients"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
            label="Clients"
          />

          {/* Catalogue (groupe depliable: Produits, Stock, Fournisseurs) */}
          <NavGroup
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
            label="Catalogue"
            isExpanded={catalogueOpen}
            onToggle={() => setCatalogueOpen(!catalogueOpen)}
          >
            <NavItem
              to="/produits"
              indent
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              label="Produits"
            />
            <NavItem
              to="/stock"
              indent
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              }
              label="Stock"
            />
            {canManageSuppliers(role) && (
              <NavItem
                to="/fournisseurs"
                indent
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
                label="Fournisseurs"
              />
            )}
          </NavGroup>

          {/* Livraisons */}
          <NavItem
            to="/livraisons"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            label="Livraisons"
          />

          {/* Neo IA */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('neoflow:open-neo'))}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all text-white/70 hover:bg-white/10 hover:text-white ${
              !isOpen && !isMobile ? 'justify-center' : ''
            }`}
            title={!isOpen ? 'Neo IA' : ''}
          >
            <span className="flex-shrink-0 relative">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-[#040741]" />
            </span>
            {(isOpen || isMobile) && <span className="text-sm">Neo IA</span>}
          </button>

          {/* Statistiques (proprietaire/manager only) */}
          {canViewStatistics(role) && (
            <NavItem
              to="/dashboard-financier"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              label="Statistiques"
            />
          )}
        </nav>

        {/* Settings + Admin */}
        <div className="space-y-1">
          <NavItem
            to="/settings"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            label="Parametres"
          />
          {isAdminUser(userEmail) && (
            <NavItem
              to="/admin"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              }
              label="Admin"
            />
          )}
        </div>
      </aside>

      <MobileBottomNav />
    </>
  )
}
