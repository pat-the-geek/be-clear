import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { tengApi, orgApi, envApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import EngTable from '@/components/shared/EngTable'
import { useDebounce } from '@/hooks/useDebounce'
import type { Teng, OrgBrief, EnvBrief, PaginatedResponse } from '@/types'

export default function EngListPage() {
  const isEditeur = useAuthStore((s) => s.isEditeur)
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [selectedTengId, setSelectedTengId] = useState<number | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null)
  const [selectedEnvId, setSelectedEnvId] = useState<number | null>(null)

  const debouncedSearch = useDebounce(search, 300)

  const { data: tengList } = useQuery({
    queryKey: ['teng', 'list'],
    queryFn: () => tengApi.list().then((r) => r.data as Teng[]),
  })

  const { data: orgList } = useQuery({
    queryKey: ['orgs', 'brief'],
    queryFn: () => orgApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<OrgBrief>).items),
  })

  const { data: envList } = useQuery({
    queryKey: ['envs', 'brief'],
    queryFn: () => envApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<EnvBrief>).items),
  })

  return (
    <div className="flex flex-col h-full">
      {/* ─── En-tête ──────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Engagements</h1>
          {isEditeur() && (
            <button
              onClick={() => navigate('/eng/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
            >
              <Plus size={14} />
              Nouvel engagement
            </button>
          )}
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un engagement…"
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filtre TENG */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTengId(null)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              selectedTengId == null ? 'bg-amber-100 text-amber-800 border-amber-200 font-medium' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            Tous types
          </button>
          {(tengList ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTengId(selectedTengId === t.id ? null : t.id)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                selectedTengId === t.id ? 'bg-amber-100 text-amber-800 border-amber-200 font-medium' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.nom}
            </button>
          ))}
        </div>

        {/* Filtres ORG et ENV */}
        <div className="flex items-center gap-3 flex-wrap">
          {orgList && orgList.length > 0 && (
            <select
              value={selectedOrgId ?? ''}
              onChange={(e) => setSelectedOrgId(e.target.value ? Number(e.target.value) : null)}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-700"
            >
              <option value="">Toutes les ORG</option>
              {orgList.map((o) => (
                <option key={o.id} value={o.id}>{o.nom}</option>
              ))}
            </select>
          )}
          {envList && envList.length > 0 && (
            <select
              value={selectedEnvId ?? ''}
              onChange={(e) => setSelectedEnvId(e.target.value ? Number(e.target.value) : null)}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-700"
            >
              <option value="">Tous les ENV</option>
              {envList.map((e) => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
          )}
          {(selectedOrgId != null || selectedEnvId != null) && (
            <button
              onClick={() => { setSelectedOrgId(null); setSelectedEnvId(null) }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={12} /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* ─── Tableau ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden p-6 flex flex-col">
        <EngTable
          q={debouncedSearch || undefined}
          tengId={selectedTengId ?? undefined}
          orgId={selectedOrgId ?? undefined}
          envId={selectedEnvId ?? undefined}
          defaultSortBy="created_at"
          defaultSortDir="desc"
          fillHeight
        />
      </div>
    </div>
  )
}
