import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { supabase } from '../lib/supabase'
import { canManageSuppliers, canViewStatistics, canUseSAV } from '../lib/permissions'
import { getStockAlerts } from '../services/stockService'
import { countOpenSAVTickets } from '../services/savService'

const isAdminUser = (user) => user?.app_metadata?.is_internal_admin === true

export default function Sidebar({ isOpen, setIsOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false)
  const [ventesOpen, setVentesOpen] = useState(true)
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [bottomSheet, setBottomSheet] = useState(null) // 'ventes' | 'boutique' | null
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [stockAlertCount, setStockAlertCount] = useState(0)
  const [savAlertCount, setSavAlertCount] = useState(0)
  const wsDropdownRef = useRef(null)
  const { currentWorkspace, workspaces, switchWorkspace, role, planType } = useWorkspace()

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
      setCurrentUser(user || null)
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

  // Load stock alerts count
  useEffect(() => {
    if (!currentWorkspace?.id) return
    getStockAlerts(currentWorkspace.id).then(({ outOfStock, lowStock, locationAlerts }) => {
      const locationOnlyAlerts = (locationAlerts || []).filter(a =>
        !outOfStock.some(o => o.product?.id === a.product?.id) &&
        !lowStock.some(l => l.product?.id === a.product?.id)
      )
      setStockAlertCount(outOfStock.length + lowStock.length + locationOnlyAlerts.length)
    }).catch(() => {})
  }, [currentWorkspace?.id])

  // Load open SAV tickets count (badge sidebar)
  useEffect(() => {
    if (!currentWorkspace?.id) return
    countOpenSAVTickets(currentWorkspace.id).then(setSavAlertCount).catch(() => {})
  }, [currentWorkspace?.id, location.pathname])

  // Fullscreen support (not available on iOS Safari)
  const fullscreenSupported = !!(
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled
  )

  // Track fullscreen state
  useEffect(() => {
    const handler = () => setIsFullscreen(
      !!(document.fullscreenElement || document.webkitFullscreenElement)
    )
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [])

  const toggleFullscreen = () => {
    try {
      const el = document.documentElement
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        ;(document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
      } else {
        ;(el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
      }
    } catch { /* not supported */ }
  }

  const NavItem = ({ to, icon, label, end, indent, badge }) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all ${
          isActive
            ? 'bg-[#313ADF]/10 text-[#313ADF]'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
        } ${!isOpen && !isMobile ? 'justify-center' : ''} ${indent && (isOpen || isMobile) ? 'ml-3' : ''}`
      }
      title={!isOpen ? label : ''}
    >
      <span className="flex-shrink-0 relative">
        {icon}
        {badge > 0 && !isOpen && !isMobile && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </span>
      {(isOpen || isMobile) && <span className="text-sm flex-1">{label}</span>}
      {(isOpen || isMobile) && badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )

  const NavGroup = ({ icon, label, isExpanded, onToggle, children }) => (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${
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

  // ── Icônes réutilisables ──
  const ICONS = {
    home:       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
    flash:      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    orders:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>,
    clients:    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
    delivery:   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
    stats:      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    products:   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
    stock:      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
    invoices:   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    quotes:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>,
    suppliers:  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
    settings:   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
    admin:      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
    ventes:     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>,
    more:       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" /></svg>,
    neo:        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  }

  // ── Navigation mobile par rôle ──
  // Chaque rôle a ses propres tabs et sheets adaptés à son usage quotidien
  const getMobileNavConfig = () => {
    const isAdmin = isAdminUser(currentUser)

    // PLUS sheet commun aux rôles avec gestion boutique
    const boutiqueSheet = [
      { to: '/produits',    label: 'Produits',     icon: ICONS.products },
      { to: '/stock',       label: 'Stock',        icon: ICONS.stock, badge: stockAlertCount },
      ...(canManageSuppliers(role) ? [{ to: '/fournisseurs', label: 'Fournisseurs', icon: ICONS.suppliers }] : []),
      ...(planType === 'enterprise' ? [{ to: '/admin-workspaces', label: 'Mes magasins', icon: ICONS.suppliers }] : []),
      { to: '/settings',    label: 'Paramètres',   icon: ICONS.settings },
      ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ICONS.admin }] : []),
    ]

    // Sheet ventes (commandes + facturation)
    const ventesSheet = [
      { to: '/vente-rapide', label: 'Vente rapide', icon: ICONS.flash },
      { to: '/commandes',    label: 'Commandes',    icon: ICONS.orders },
      { to: '/factures',     label: 'Factures',     icon: ICONS.invoices },
      { to: '/devis',        label: 'Devis',        icon: ICONS.quotes },
    ]

    if (role === 'livreur') {
      return {
        tabs: [
          { type: 'link',   to: '/livraisons/ma-journee', label: 'Ma journée', icon: ICONS.delivery,
            isActive: location.pathname === '/livraisons/ma-journee' },
          { type: 'link',   to: '/livraisons', label: 'Kanban', icon: ICONS.orders,
            isActive: location.pathname === '/livraisons' },
          { type: 'link',   to: '/dashboard',  label: 'Accueil',   icon: ICONS.home,
            isActive: location.pathname === '/dashboard' },
          { type: 'neo',    label: 'Neo IA',   icon: ICONS.neo },
          { type: 'sheet',  sheetKey: 'plus',  label: 'Plus',      icon: ICONS.more,
            sheet: [
              { to: '/produits',  label: 'Produits',   icon: ICONS.products },
              { to: '/settings',  label: 'Paramètres', icon: ICONS.settings },
              ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: ICONS.admin }] : []),
            ]
          },
        ]
      }
    }

    if (role === 'vendeur') {
      return {
        tabs: [
          { type: 'link',  to: '/vente-rapide', label: 'Vente',    icon: ICONS.flash,
            isActive: location.pathname.startsWith('/vente-rapide') },
          { type: 'link',  to: '/commandes',    label: 'Commandes',icon: ICONS.orders,
            isActive: location.pathname.startsWith('/commandes') },
          { type: 'link',  to: '/clients',      label: 'Clients',  icon: ICONS.clients,
            isActive: location.pathname.startsWith('/clients') },
          { type: 'neo',   label: 'Neo IA',     icon: ICONS.neo },
          { type: 'sheet', sheetKey: 'plus',    label: 'Plus',     icon: ICONS.more,
            sheet: [
              { to: '/factures',  label: 'Factures',   icon: ICONS.invoices },
              { to: '/devis',     label: 'Devis',      icon: ICONS.quotes },
              { to: '/produits',  label: 'Produits',   icon: ICONS.products },
              { to: '/stock',     label: 'Stock',      icon: ICONS.stock, badge: stockAlertCount },
              { to: '/livraisons',label: 'Livraisons', icon: ICONS.delivery },
              { to: '/settings',  label: 'Paramètres', icon: ICONS.settings },
            ]
          },
        ]
      }
    }

    // manager & propriétaire — même structure
    return {
      tabs: [
        { type: 'link',  to: '/dashboard',          label: 'Accueil',  icon: ICONS.home,
          isActive: location.pathname === '/dashboard' },
        { type: 'sheet', sheetKey: 'ventes',         label: 'Ventes',   icon: ICONS.ventes,
          isActive: ventesRoutes.some(r => location.pathname.startsWith(r)),
          sheet: ventesSheet },
        { type: 'link',  to: '/clients',             label: 'Clients',  icon: ICONS.clients,
          isActive: location.pathname.startsWith('/clients') },
        { type: 'link',  to: '/dashboard-financier', label: 'Stats',    icon: ICONS.stats,
          isActive: location.pathname.startsWith('/dashboard-financier') },
        { type: 'sheet', sheetKey: 'plus',           label: 'Plus',     icon: ICONS.more,
          sheet: boutiqueSheet },
      ]
    }
  }

  const navConfig = getMobileNavConfig()

  const MobileBottomNav = () => {
    const activeSheet = navConfig.tabs.find(t => t.type === 'sheet' && t.sheetKey === bottomSheet)

    return (
    <>
      {/* Sheet backdrop */}
      {bottomSheet && (
        <div className="md:hidden fixed inset-0 z-[45]" onClick={() => setBottomSheet(null)} />
      )}

      {/* Sheet panel */}
      {bottomSheet && activeSheet && (
        <div
          className="md:hidden fixed left-0 right-0 z-[46] bg-white/95 backdrop-blur-2xl border border-gray-200/60 rounded-t-2xl shadow-2xl overflow-hidden"
          style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-1" />
          <p className="text-gray-400 text-[11px] font-medium uppercase tracking-wider px-5 py-2">
            {activeSheet.label}
          </p>
          <div className="px-3 pb-3 space-y-0.5">
            {activeSheet.sheet.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setBottomSheet(null)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-[#313ADF]/10 text-[#313ADF] font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <span className="flex-shrink-0 relative">
                  {item.icon}
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* Nav bar */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-2xl border-t border-gray-200/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around py-1">
          {navConfig.tabs.map((tab, idx) => {
            if (tab.type === 'neo') {
              return (
                <NavLink
                  key={idx}
                  to="/neo"
                  onClick={() => setBottomSheet(null)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] transition-colors ${isActive ? 'text-[#313ADF]' : 'text-gray-400 hover:text-gray-700'}`
                  }
                >
                  <span className="relative">
                    {tab.icon}
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border-2 border-white" />
                  </span>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </NavLink>
              )
            }

            if (tab.type === 'link') {
              return (
                <NavLink
                  key={idx}
                  to={tab.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] transition-colors ${isActive ? 'text-[#313ADF]' : 'text-gray-400'}`
                  }
                >
                  <span className="relative">
                    {tab.icon}
                  </span>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </NavLink>
              )
            }

            if (tab.type === 'sheet') {
              const isThisSheetOpen = bottomSheet === tab.sheetKey
              const isActive = tab.isActive || isThisSheetOpen
              return (
                <button
                  key={idx}
                  onClick={() => setBottomSheet(s => s === tab.sheetKey ? null : tab.sheetKey)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 px-3 min-w-[60px] transition-colors ${isActive ? 'text-[#313ADF]' : 'text-gray-400'}`}
                >
                  <span className="relative">
                    {tab.icon}
                    {isThisSheetOpen && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#313ADF] rounded-full" />
                    )}
                    {!isThisSheetOpen && tab.sheetKey === 'plus' && stockAlertCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
                        {stockAlertCount > 99 ? '99+' : stockAlertCount}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              )
            }

            return null
          })}
        </div>
      </div>
    </>
    )
  }

  const DesktopToggle = () => (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="hidden md:flex absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 text-gray-500 rounded-full items-center justify-center shadow-md hover:bg-gray-50 transition-colors z-10"
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

      {/* Bouton plein écran mobile (haut-droit) — masqué sur iOS */}
      {isMobile && !isOpen && fullscreenSupported && (
        <div className="md:hidden fixed right-3 z-[45]" style={{ top: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}>
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
        </div>
      )}

      <aside
        className={`fixed left-0 top-0 h-screen bg-white/90 backdrop-blur-2xl border-r border-gray-200/60 flex flex-col p-4 transition-all duration-300 z-40
          ${isMobile
            ? isOpen ? 'w-full translate-x-0' : '-translate-x-full w-full'
            : isOpen ? 'w-[240px]' : 'w-[72px]'
          }`}
        style={{ paddingTop: `calc(1rem + env(safe-area-inset-top, 0px))` }}
      >
        <DesktopToggle />

        {/* Bouton fermer (mobile uniquement) */}
        {isMobile && (
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors z-10"
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
          className={`mb-5 hover:opacity-75 transition-opacity overflow-hidden ${
            isOpen || isMobile ? 'p-1' : 'p-1'
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
              className="w-full px-3 py-2 bg-gray-100 rounded-xl hover:bg-gray-200/80 transition-colors text-left"
            >
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Workspace</p>
              <div className="flex items-center justify-between">
                <p className="text-gray-900 text-sm font-semibold truncate">{currentWorkspace.name}</p>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${wsDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {wsDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200/60 rounded-xl shadow-xl z-50 overflow-hidden">
                {workspaces.map(ws => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      switchWorkspace(ws.id)
                      setWsDropdownOpen(false)
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm transition-colors flex items-center gap-2 ${
                      ws.id === currentWorkspace.id
                        ? 'bg-[#313ADF]/10 text-[#313ADF] font-semibold'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <span className="w-6 h-6 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-bold text-gray-700 flex-shrink-0">
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
            className="mb-4 w-10 h-10 mx-auto bg-gray-100 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors"
            title={currentWorkspace.name}
          >
            <span className="text-gray-700 text-sm font-bold">{currentWorkspace.name?.charAt(0)?.toUpperCase()}</span>
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
              badge={stockAlertCount}
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
          {role === 'livreur' && (
            <NavItem
              to="/livraisons/ma-journee"
              indent
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              }
              label="Ma journée"
            />
          )}

          {/* SAV */}
          <NavItem
            to="/sav"
            badge={savAlertCount}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
            label="SAV"
          />

          {/* Neo IA */}
          <NavItem
            to="/neo"
            icon={
              <span className="relative">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border-2 border-white" />
              </span>
            }
            label="Neo IA"
          />

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

          {/* Multi-workspace Enterprise */}
          {planType === 'enterprise' && (
            <NavItem
              to="/admin-workspaces"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              label="Mes magasins"
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
          {isAdminUser(currentUser) && (
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
