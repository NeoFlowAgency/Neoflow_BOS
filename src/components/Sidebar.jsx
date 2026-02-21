import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'

export default function Sidebar({ isOpen, setIsOpen }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)
  const { currentWorkspace, isLivreur } = useWorkspace()

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
      <MobileToggle />

      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-screen bg-gradient-to-b from-[#040741] to-[#0a0b52] flex flex-col p-5 transition-all duration-300 z-40
          ${isMobile
            ? isOpen ? 'w-[280px] translate-x-0' : '-translate-x-full w-[280px]'
            : isOpen ? 'w-[240px]' : 'w-[80px]'
          }`}
      >
        <DesktopToggle />

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

        {/* Workspace name badge */}
        {currentWorkspace && (isOpen || isMobile) && (
          <div className="mb-4 px-3 py-2 bg-white/10 rounded-xl">
            <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Workspace</p>
            <p className="text-white text-sm font-semibold truncate">{currentWorkspace.name}</p>
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
          {!isLivreur && (
            <NavItem
              to="/factures"
              end
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              label="Factures"
            />
          )}
          {!isLivreur && (
            <NavItem
              to="/devis"
              end
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              }
              label="Devis"
            />
          )}
          {!isLivreur && (
            <NavItem
              to="/clients"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
              label="Clients"
            />
          )}
          {!isLivreur && (
            <NavItem
              to="/produits"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
              label="Produits"
            />
          )}
          <NavItem
            to="/livraisons"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            }
            label="Livraisons"
          />
          {!isLivreur && (
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

        {/* Settings */}
        <NavItem
          to="/settings"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
          label="Paramètres"
        />
      </aside>
    </>
  )
}
