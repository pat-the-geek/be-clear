import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import MainLayout from '@/components/layout/MainLayout'
import AuthLayout from '@/components/layout/AuthLayout'

// Pages
import LoginPage from '@/pages/auth/LoginPage'
import OidcCallbackPage from '@/pages/auth/OidcCallbackPage'
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
import EventEditPage from '@/pages/event/EventEditPage'
import SearchPage from '@/pages/search/SearchPage'
import RagPage from '@/pages/rag/RagPage'
import AdminPage from '@/pages/admin/AdminPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import EngListPage from '@/pages/eng/EngListPage'
import EngCreatePage from '@/pages/eng/EngCreatePage'
import EventListPage from '@/pages/event/EventListPage'
import EventCreatePage from '@/pages/event/EventCreatePage'
import GraphPage from '@/pages/graph/GraphPage'
import NotFoundPage from '@/pages/NotFoundPage'

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
        <Route path="/oidc-callback" element={<OidcCallbackPage />} />
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
        <Route path="/eng" element={<EngListPage />} />
        <Route path="/eng/new" element={<EngCreatePage />} />
        <Route path="/eng/:id" element={<EngDetailPage />} />
        <Route path="/eng/:id/edit" element={<EngEditPage />} />

        {/* Évènements */}
        <Route path="/events" element={<EventListPage />} />
        <Route path="/event/new" element={<EventCreatePage />} />
        <Route path="/event/:id" element={<EventDetailPage />} />
        <Route path="/event/:id/edit" element={<EventEditPage />} />

        {/* Graphe global */}
        <Route path="/graph" element={<GraphPage />} />

        {/* Recherche & IA */}
        <Route path="/search" element={<SearchPage />} />
        <Route path="/rag" element={<RagPage />} />

        {/* Administration */}
        <Route path="/admin/*" element={<AdminPage />} />

        {/* Profil utilisateur */}
        <Route path="/profile" element={<ProfilePage />} />

        {/* 404 dans la zone protégée */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Fallback hors auth */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
