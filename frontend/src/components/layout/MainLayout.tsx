import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Globe, Handshake, CalendarClock,
  Search, Bot, Settings, LogOut,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import iconSvg from '@/assets/icon.svg'

const navItems = [
  { to: '/panel',  label: 'Mon panel',     icon: LayoutDashboard },
  { to: '/org',    label: 'Organisations', icon: Building2 },
  { to: '/env',    label: 'Environnements',icon: Globe },
  { to: '/eng',    label: 'Engagements',   icon: Handshake },
  { to: '/events', label: 'Événements',    icon: CalendarClock },
  { to: '/search', label: 'Recherche',     icon: Search },
  { to: '/rag',    label: 'Terminal IA',   icon: Bot },
]

export default function MainLayout() {
  const { user, logout, isAdmin } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ─── Sidebar ─────────────────────────── */}
      <aside className="w-56 flex flex-col bg-white border-r border-gray-200 shrink-0">
        {/* Logo */}
        <div className="px-4 pt-4 pb-4 border-b border-gray-100">
          <img src={iconSvg} alt="be.CLEAR icon" className="w-10 h-10 mb-2" />
          <span className="font-bold text-xl text-gray-900">be.CLEAR</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}

          {isAdmin() && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mt-4 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Settings size={16} />
              Administration
            </NavLink>
          )}
        </nav>

        {/* Footer utilisateur */}
        <div className="p-3 border-t border-gray-100">
          <Link to="/profile" className="flex items-center gap-2 mb-2 px-1 rounded-lg hover:bg-gray-50 transition-colors py-1">
            <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium shrink-0">
              {user?.obj?.nom?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user?.obj?.nom}</p>
              <p className="text-xs text-gray-400">{user?.role}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={13} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ─── Contenu principal ───────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
