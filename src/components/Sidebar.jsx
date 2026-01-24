import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Sidebar() {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-[200px] bg-[#1e1b4b] flex flex-col p-5">
      {/* Logo Neoflow Agency avec fond blanc arrondi */}
      <div className="bg-white rounded-2xl p-3 mb-10 shadow-lg">
        <img
          src="/logo-neoflow.png"
          alt="Neoflow Agency"
          className="h-14 w-full object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1">
        <ul className="space-y-4">
          <li>
            <NavLink
              to="/devis"
              className={({ isActive }) =>
                `block px-6 py-3 rounded-xl font-bold text-lg text-center transition-all ${
                  isActive
                    ? 'bg-white text-[#1e1b4b] shadow-md'
                    : 'bg-white text-[#1e1b4b] shadow-md hover:shadow-lg'
                }`
              }
            >
              Devis
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/livraisons"
              className={({ isActive }) =>
                `block px-6 py-3 rounded-xl font-bold text-lg text-center transition-all ${
                  isActive
                    ? 'bg-white text-[#1e1b4b] shadow-md border-2 border-[#1e1b4b]'
                    : 'bg-white text-[#1e1b4b] shadow-md hover:shadow-lg'
                }`
              }
            >
              Livraison
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* Bouton déconnexion discret */}
      <button
        onClick={handleLogout}
        className="text-white/50 hover:text-white text-xs py-2 transition-colors"
      >
        Déconnexion
      </button>
    </aside>
  )
}
