import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Globe, Handshake, CalendarClock,
  Search, Bot, Settings, LogOut, Menu, X, Network, Bell, AlertTriangle, Clock,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { eventApi } from '@/services/api'
import { formatDateTime } from '@/lib/utils'
import iconSvg from '@/assets/icon.svg'

interface EventAlert {
  id: number; nom: string; eng_nom: string; tevent_nom: string; date_heure_prevue: string
}

const navItems = [
  { to: '/panel',  label: 'Mon panel',     icon: LayoutDashboard },
  { to: '/org',    label: 'Organisations', icon: Building2 },
  { to: '/env',    label: 'Environnements',icon: Globe },
  { to: '/eng',    label: 'Engagements',   icon: Handshake },
  { to: '/events', label: 'Événements',    icon: CalendarClock, overdueBadge: true },
  { to: '/graph',  label: 'Graphe',        icon: Network },
  { to: '/search', label: 'Recherche',     icon: Search },
  { to: '/rag',    label: 'Terminal IA',   icon: Bot },
]

export default function MainLayout() {
  const { user, logout, isAdmin } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  // On navigation: reset body styles and remove any full-screen portal overlay left over
  // from the previous route (a transparent fixed inset-0 div silently blocks all clicks)
  useEffect(() => {
    document.body.style.overflow = ''
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    const root = document.getElementById('root')
    for (const child of Array.from(document.body.children)) {
      if (child === root) continue
      const el = child as HTMLElement
      const rect = el.getBoundingClientRect()
      // Full-screen = covers ≥ 90% of viewport in both dimensions
      if (rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9) {
        console.warn('[be.CLEAR] Portail orphelin supprimé:', el.className.slice(0, 80))
        el.remove()
      }
    }
  }, [location.pathname])

  // Ctrl+Shift+D : diagnostic + récupération manuelle en cas de freeze
  useEffect(() => {
    function onDebug(e: KeyboardEvent) {
      if (!e.ctrlKey || !e.shiftKey || e.key !== 'D') return
      e.preventDefault()
      const root = document.getElementById('root')
      const portals = Array.from(document.body.children).filter(c => c !== root) as HTMLElement[]
      console.group('[be.CLEAR] Diagnostic freeze')
      portals.forEach(el => {
        const rect = el.getBoundingClientRect()
        const s = window.getComputedStyle(el)
        console.log({ class: el.className.slice(0, 80), position: s.position, pointerEvents: s.pointerEvents, z: s.zIndex, rect: { w: Math.round(rect.width), h: Math.round(rect.height), t: Math.round(rect.top), l: Math.round(rect.left) } })
      })
      const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
      console.log('Element centre viewport:', center)
      console.groupEnd()
      // Tentative de récupération : supprimer les portails plein-écran bloquants
      portals.forEach(el => {
        const rect = el.getBoundingClientRect()
        if (rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9) {
          console.warn('[be.CLEAR] Suppression portail bloquant:', el.className.slice(0, 80))
          el.remove()
        }
      })
    }
    window.addEventListener('keydown', onDebug)
    return () => window.removeEventListener('keydown', onDebug)
  }, [])

  const { data: overdueData } = useQuery({
    queryKey: ['events', 'overdue', 'sidebar'],
    queryFn: () => eventApi.overdue(500).then((r) => r.data as EventAlert[]),
    staleTime: 1000 * 60 * 2,
  })
  const { data: upcomingData } = useQuery({
    queryKey: ['events', 'upcoming', 'sidebar'],
    queryFn: () => eventApi.upcoming(5).then((r) => r.data as EventAlert[]),
    staleTime: 1000 * 60 * 2,
  })
  const overdueCount = overdueData?.length ?? 0
  const totalAlerts = overdueCount + (upcomingData?.length ?? 0)

  useEffect(() => {
    if (!bellOpen) return
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bellOpen])

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
        {totalAlerts > 0 && (
          <div ref={bellRef} className="relative mb-2">
            <button
              onClick={() => setBellOpen((v) => !v)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors ${bellOpen ? 'bg-amber-50 text-amber-700' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <Bell size={13} />
              <span className="flex-1 text-left">{overdueCount > 0 ? `${overdueCount} en retard` : `${totalAlerts} à venir`}</span>
              {overdueCount > 0 && <span className="w-2 h-2 rounded-full bg-red-500" />}
            </button>
            {bellOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-72 overflow-y-auto">
                {(overdueData ?? []).length > 0 && (
                  <div>
                    <p className="px-3 py-2 text-[10px] font-semibold text-red-500 uppercase tracking-wide bg-red-50 border-b border-red-100">
                      En retard ({overdueData!.length})
                    </p>
                    {overdueData!.slice(0, 5).map((ev) => (
                      <Link key={ev.id} to={`/event/${ev.id}`} onClick={() => setBellOpen(false)}
                        className="flex items-start gap-2 px-3 py-2 hover:bg-red-50 transition-colors border-b border-gray-100 last:border-0">
                        <AlertTriangle size={11} className="text-red-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{ev.nom}</p>
                          <p className="text-[10px] text-gray-400 truncate">{ev.eng_nom}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
                {(upcomingData ?? []).length > 0 && (
                  <div>
                    <p className="px-3 py-2 text-[10px] font-semibold text-sky-500 uppercase tracking-wide bg-sky-50 border-b border-sky-100">
                      À venir ({upcomingData!.length})
                    </p>
                    {upcomingData!.slice(0, 5).map((ev) => (
                      <Link key={ev.id} to={`/event/${ev.id}`} onClick={() => setBellOpen(false)}
                        className="flex items-start gap-2 px-3 py-2 hover:bg-sky-50 transition-colors border-b border-gray-100 last:border-0">
                        <Clock size={11} className="text-sky-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">{ev.nom}</p>
                          <p className="text-[10px] text-gray-400 truncate">{formatDateTime(ev.date_heure_prevue)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
          <span className="font-bold text-gray-900 flex-1">be.CLEAR</span>
          {totalAlerts > 0 && (
            <button
              onClick={() => navigate('/panel')}
              className="relative p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <Bell size={18} />
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5">
                {totalAlerts > 99 ? '99+' : totalAlerts}
              </span>
            </button>
          )}
        </div>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
