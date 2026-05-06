import { useState } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Globe, Handshake, CalendarClock,
  Search, Bot, Settings, LogOut, Menu, X,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { eventApi } from '@/services/api'
import iconSvg from '@/assets/icon.svg'

const navItems = [
  { to: '/panel',  label: 'Mon panel',     icon: LayoutDashboard },
  { to: '/org',    label: 'Organisations', icon: Building2 },
  { to: '/env',    label: 'Environnements',icon: Globe },
  { to: '/eng',    label: 'Engagements',   icon: Handshake },
  { to: '/events', label: 'Événements',    icon: CalendarClock, overdueBadge: true },
  { to: '/search', label: 'Recherche',     icon: Search },
  { to: '/rag',    label: 'Terminal IA',   icon: Bot },
]

export default function MainLayout() {
  const { user, logout, isAdmin } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: overdueData } = useQuery({
    queryKey: ['events', 'overdue', 'sidebar'],
    queryFn: () => eventApi.overdue(500).then((r) => r.data as unknown[]),
    staleTime: 1000 * 60 * 2,
  })
  const overdueCount = overdueData?.length ?? 0

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function closeMobile() {
    setMobileOpen(false)
  }

  const sidebar = (
    <aside className="w-56 flex flex-col bg-white border-r border-gray-200 h-full">
      {/* Logo */}
      <div className="px-4 pt-4 pb-4 border-b border-gray-100 flex items-center gap-2 md:block">
        <img src={iconSvg} alt="be.CLEAR icon" className="w-10 h-10 md:mb-2" />
        <span className="font-bold text-xl text-gray-900">be.CLEAR</span>
        <button
          onClick={closeMobile}
          className="ml-auto md:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {navItems.map(({ to, label, icon: Icon, overdueBadge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={closeMobile}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Icon size={16} />
            <span className="flex-1">{label}</span>
            {overdueBadge && overdueCount > 0 && (
              <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
                {overdueCount > 99 ? '99+' : overdueCount}
              </span>
            )}
          </NavLink>
        ))}

        {isAdmin() && (
          <NavLink
            to="/admin"
            onClick={closeMobile}
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
        <Link to="/profile" onClick={closeMobile} className="flex items-center gap-2 mb-2 px-1 rounded-lg hover:bg-gray-50 transition-colors py-1">
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
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* ─── Sidebar desktop ─────────────────────── */}
      <div className="hidden md:flex shrink-0">
        {sidebar}
      </div>

      {/* ─── Sidebar mobile (overlay) ────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={closeMobile}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-56 md:hidden flex flex-col">
            {sidebar}
          </div>
        </>
      )}

      {/* ─── Contenu principal ───────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar mobile */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <Menu size={20} />
          </button>
          <img src={iconSvg} alt="" className="w-6 h-6" />
          <span className="font-bold text-gray-900">be.CLEAR</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
