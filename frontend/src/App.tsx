import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import MainLayout from '@/components/layout/MainLayout'
import AuthLayout from '@/components/layout/AuthLayout'

// Pages
import LoginPage from '@/pages/auth/LoginPage'
import PanelPage from '@/pages/panel/PanelPage'
import OrgListPage from '@/pages/org/OrgListPage'
import OrgDetailPage from '@/pages/org/OrgDetailPage'
import OrgEditPage from '@/pages/org/OrgEditPage'
import OrgCreatePage from '@/pages/org/OrgCreatePage'
import EnvListPage from '@/pages/env/EnvListPage'
import EnvDetailPage from '@/pages/env/EnvDetailPage'
import EnvEditPage from '@/pages/env/EnvEditPage'
import EnvCreatePage from '@/pages/env/EnvCreatePage'
import EngDetailPage from '@/pages/eng/EngDetailPage'
import EngEditPage from '@/pages/eng/EngEditPage'
import EventDetailPage from '@/pages/event/EventDetailPage'
import SearchPage from '@/pages/search/SearchPage'
import RagPage from '@/pages/rag/RagPage'
import AdminPage from '@/pages/admin/AdminPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Auth */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* Application (protégée) */}
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/panel" replace />} />
        <Route path="/panel" element={<PanelPage />} />

        {/* Organisations — arbre types (gauche) + liste (milieu) */}
        <Route path="/org" element={<OrgListPage />} />
        <Route path="/org/new" element={<OrgCreatePage />} />
        <Route path="/org/:id" element={<OrgDetailPage />} />
        <Route path="/org/:id/edit" element={<OrgEditPage />} />

        {/* Environnements — arbre types (gauche) + liste (milieu) */}
        <Route path="/env" element={<EnvListPage />} />
        <Route path="/env/new" element={<EnvCreatePage />} />
        <Route path="/env/:id" element={<EnvDetailPage />} />
        <Route path="/env/:id/edit" element={<EnvEditPage />} />

        {/* Engagements */}
        <Route path="/eng/:id" element={<EngDetailPage />} />
        <Route path="/eng/:id/edit" element={<EngEditPage />} />

        {/* Évènements */}
        <Route path="/event/:id" element={<EventDetailPage />} />

        {/* Recherche & IA */}
        <Route path="/search" element={<SearchPage />} />
        <Route path="/rag" element={<RagPage />} />

        {/* Administration */}
        <Route path="/admin/*" element={<AdminPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/panel" replace />} />
    </Routes>
  )
}
