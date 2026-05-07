import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { tengApi, orgApi, envApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import EngTable from '@/components/shared/EngTable'
import { useDebounce } from '@/hooks/useDebounce'
import type { Teng, OrgBrief, EnvBrief, PaginatedResponse } from '@/types'

// ─── Combobox de sélection ORG / ENV ────────────────────────────

interface ComboItem { id: number; nom: string }

function EntityCombobox({
  items,
  selectedId,
  placeholder,
  colorClass,
  onSelect,
  onClear,
}: {
  items: ComboItem[]
  selectedId: number | null
  placeholder: string
  colorClass: string
  onSelect: (id: number) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = selectedId ? items.find((i) => i.id === selectedId) : null

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 10)
    const q = query.toLowerCase()
    return items.filter((i) => i.nom.toLowerCase().includes(q)).slice(0, 10)
  }, [items, query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (selected) {
    return (
      <div className={`flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-xs font-medium rounded-lg border ${colorClass}`}>
        <span>{selected.nom}</span>
        <button onClick={onClear} className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity">
          <X size={11} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 w-44"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-56 overflow-y-auto min-w-full">
          {filtered.map((item) => (
            <button
              key={item.id}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(item.id)
                setOpen(false)
                setQuery('')
              }}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-amber-50 hover:text-amber-800 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              {item.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────

export default function EngListPage() {
  const isEditeur = useAuthStore((s) => s.isEditeur)
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [selectedTengId, setSelectedTengId] = useState<number | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null)
  const [selectedEnvId, setSelectedEnvId] = useState<number | null>(null)
  const [selectedStatus, setSelectedStatus] = useState<'non_demarre' | 'en_cours' | 'termine' | null>(null)

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

        {/* Filtre statut */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { value: null,           label: 'Tous', color: 'amber' },
            { value: 'non_demarre',  label: 'Non démarré', color: 'gray' },
            { value: 'en_cours',     label: 'En cours', color: 'blue' },
            { value: 'termine',      label: 'Terminé', color: 'green' },
          ] as const).map(({ value, label, color }) => {
            const active = selectedStatus === value
            const styles: Record<string, string> = {
              amber: active ? 'bg-amber-100 text-amber-800 border-amber-200 font-medium' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              gray:  active ? 'bg-gray-200 text-gray-800 border-gray-300 font-medium'   : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              blue:  active ? 'bg-blue-100 text-blue-800 border-blue-200 font-medium'   : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              green: active ? 'bg-green-100 text-green-800 border-green-200 font-medium': 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
            }
            return (
              <button key={label} onClick={() => setSelectedStatus(value)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${styles[color]}`}>
                {label}
              </button>
            )
          })}
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
        <div className="flex items-center gap-2 flex-wrap">
          {orgList && orgList.length > 0 && (
            <EntityCombobox
              items={orgList}
              selectedId={selectedOrgId}
              placeholder="Rechercher une ORG…"
              colorClass="bg-blue-50 text-blue-700 border-blue-200"
              onSelect={setSelectedOrgId}
              onClear={() => setSelectedOrgId(null)}
            />
          )}
          {envList && envList.length > 0 && (
            <EntityCombobox
              items={envList}
              selectedId={selectedEnvId}
              placeholder="Rechercher un ENV…"
              colorClass="bg-orange-50 text-orange-700 border-orange-200"
              onSelect={setSelectedEnvId}
              onClear={() => setSelectedEnvId(null)}
            />
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
          status={selectedStatus ?? undefined}
          defaultSortBy="created_at"
          defaultSortDir="desc"
          fillHeight
        />
      </div>
    </div>
  )
}
