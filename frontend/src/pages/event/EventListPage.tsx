import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, AlertTriangle, X, Search, Plus, List, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { eventApi, teventApi, orgApi, envApi, engApi } from '@/services/api'
import { formatDateTime } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import type { Tevent, OrgBrief, EnvBrief, PaginatedResponse } from '@/types'

interface EventItem {
  id: number
  obj: { nom: string }
  eng_id: number
  eng_nom?: string
  tevent: { id: number; nom: string }
  date_heure_prevue: string
  date_heure_reelle?: string
  est_accompli: boolean
}

interface EngBriefItem {
  id: number
  nom: string
}

const PER_PAGE = 50

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function CalendarGrid({ year, month, events }: { year: number; month: number; events: EventItem[] }) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const cells: Array<{ day: number; evs: EventItem[] } | null> = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, evs: events.filter((ev) => ev.date_heure_prevue.startsWith(dateStr)) })
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="min-h-16 bg-gray-50 rounded-lg" />
          const isToday = year === today.getFullYear() && month === today.getMonth() && cell.day === today.getDate()
          return (
            <div
              key={i}
              className={`min-h-16 rounded-lg p-1 border ${isToday ? 'border-sky-300 bg-sky-50' : 'border-gray-100 bg-white'}`}
            >
              <p className={`text-xs font-medium mb-0.5 ${isToday ? 'text-sky-700' : 'text-gray-400'}`}>{cell.day}</p>
              <div className="space-y-0.5">
                {cell.evs.slice(0, 3).map((ev) => {
                  const overdue = !ev.est_accompli && new Date(ev.date_heure_prevue) < today
                  return (
                    <Link
                      key={ev.id}
                      to={`/event/${ev.id}`}
                      className={`block text-[10px] px-1 py-0.5 rounded truncate leading-tight ${
                        ev.est_accompli
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : overdue
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                      }`}
                      title={ev.obj.nom}
                    >
                      {ev.obj.nom}
                    </Link>
                  )
                })}
                {cell.evs.length > 3 && (
                  <p className="text-[10px] text-gray-400 pl-1">+{cell.evs.length - 3}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function EventListPage() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [search, setSearch] = useState('')
  const [selectedTeventId, setSelectedTeventId] = useState<number | null>(null)
  const [selectedEngId, setSelectedEngId] = useState<number | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null)
  const [selectedEnvId, setSelectedEnvId] = useState<number | null>(null)
  const [accompli, setAccompli] = useState<boolean | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)

  const { data: tevents } = useQuery({
    queryKey: ['tevents'],
    queryFn: () => teventApi.list().then((r) => r.data as Tevent[]),
  })

  const { data: orgList } = useQuery({
    queryKey: ['orgs', 'brief'],
    queryFn: () => orgApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<OrgBrief>).items),
  })

  const { data: envList } = useQuery({
    queryKey: ['envs', 'brief'],
    queryFn: () => envApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<EnvBrief>).items),
  })

  const { data: engList } = useQuery({
    queryKey: ['engs', 'brief'],
    queryFn: () => engApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<EngBriefItem>).items),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['events', 'list', debouncedSearch, selectedTeventId, selectedEngId, selectedOrgId, selectedEnvId, accompli, dateFrom, dateTo, page],
    queryFn: () =>
      eventApi.list({
        q: debouncedSearch || undefined,
        tevent_id: selectedTeventId ?? undefined,
        eng_id: selectedEngId ?? undefined,
        org_id: selectedOrgId ?? undefined,
        env_id: selectedEnvId ?? undefined,
        accompli: accompli ?? undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        per_page: PER_PAGE,
      }).then((r) => r.data as PaginatedResponse<EventItem>),
    placeholderData: (prev) => prev,
    enabled: viewMode === 'list',
  })

  const calMonthStart = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`
  const calMonthEnd = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(new Date(calYear, calMonth + 1, 0).getDate()).padStart(2, '0')}`

  const { data: calData, isLoading: calLoading } = useQuery({
    queryKey: ['events', 'calendar', calYear, calMonth],
    queryFn: () =>
      eventApi.list({ date_from: calMonthStart, date_to: calMonthEnd, per_page: 200 })
        .then((r) => r.data as PaginatedResponse<EventItem>),
    enabled: viewMode === 'calendar',
  })

  const events = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PER_PAGE)

  function resetFilters() {
    setSelectedTeventId(null)
    setSelectedEngId(null)
    setSelectedOrgId(null)
    setSelectedEnvId(null)
    setAccompli(null)
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }

  const hasActiveFilter = selectedTeventId != null || selectedEngId != null || selectedOrgId != null || selectedEnvId != null || accompli != null || dateFrom || dateTo || search

  return (
    <div className="flex flex-col h-full">
      {/* ─── En-tête ──────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Événements</h1>
          <div className="flex items-center gap-2">
            {/* Toggle vue liste / calendrier */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                  viewMode === 'list'
                    ? 'bg-sky-100 text-sky-700 font-medium'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <List size={13} />
                Liste
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border-l border-gray-200 transition-colors ${
                  viewMode === 'calendar'
                    ? 'bg-sky-100 text-sky-700 font-medium'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <CalendarDays size={13} />
                Calendrier
              </button>
            </div>
            <button
              onClick={() => navigate('/event/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 transition-colors"
            >
              <Plus size={14} />
              Nouvel évènement
            </button>
          </div>
        </div>

        {/* Barre de recherche + réinitialisation */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Rechercher un événement…"
              className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>

          {hasActiveFilter && (
            <button onClick={resetFilters} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <X size={12} /> Réinitialiser
            </button>
          )}
        </div>

        {/* Statut */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Tous', value: null },
            { label: 'En attente', value: false },
            { label: 'Accomplis', value: true },
          ].map(({ label, value }) => (
            <button
              key={String(value)}
              onClick={() => { setAccompli(value); setPage(1) }}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                accompli === value
                  ? 'bg-sky-100 text-sky-800 border-sky-200 font-medium'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}

          {/* Filtre rapide En retard */}
          <button
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10)
              setAccompli(false)
              setDateTo(today)
              setPage(1)
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              accompli === false && dateTo === new Date().toISOString().slice(0, 10)
                ? 'bg-red-100 text-red-800 border-red-200 font-medium'
                : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
            }`}
          >
            <AlertTriangle size={11} />
            En retard
          </button>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          {/* Filtre TEVENT */}
          {(tevents ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() => { setSelectedTeventId(selectedTeventId === t.id ? null : t.id); setPage(1) }}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                selectedTeventId === t.id
                  ? 'bg-sky-100 text-sky-800 border-sky-200 font-medium'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.nom}
            </button>
          ))}
        </div>

        {/* Filtres ENG / ORG / ENV */}
        <div className="flex items-center gap-2 flex-wrap">
          {engList && engList.length > 0 && (
            <select
              value={selectedEngId ?? ''}
              onChange={(e) => { setSelectedEngId(e.target.value ? Number(e.target.value) : null); setPage(1) }}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-700"
            >
              <option value="">Tous les ENG</option>
              {engList.map((e) => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
          )}
          {orgList && orgList.length > 0 && (
            <select
              value={selectedOrgId ?? ''}
              onChange={(e) => { setSelectedOrgId(e.target.value ? Number(e.target.value) : null); setPage(1) }}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-700"
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
              onChange={(e) => { setSelectedEnvId(e.target.value ? Number(e.target.value) : null); setPage(1) }}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-700"
            >
              <option value="">Tous les ENV</option>
              {envList.map((e) => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
          )}
        </div>

        {/* Filtre dates */}
        <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
          <span className="text-xs font-medium">Période :</span>
          <label className="flex items-center gap-1.5 text-xs">
            Du
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            Au
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
        </div>
      </div>

      {/* ─── Contenu ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {viewMode === 'calendar' ? (
          <>
            {/* En-tête navigation calendrier */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
                  else setCalMonth((m) => m - 1)
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <h2 className="text-base font-semibold text-gray-800">
                {MONTH_NAMES[calMonth]} {calYear}
              </h2>
              <button
                onClick={() => {
                  if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
                  else setCalMonth((m) => m + 1)
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            {calLoading ? (
              <div className="text-center text-gray-400 py-16">Chargement…</div>
            ) : (
              <CalendarGrid year={calYear} month={calMonth} events={calData?.items ?? []} />
            )}
          </>
        ) : isLoading ? (
          <div className="text-center text-gray-400 py-16">Chargement…</div>
        ) : events.length === 0 ? (
          <div className="text-center text-gray-400 py-16">Aucun événement.</div>
        ) : (
          <div className="space-y-1">
            {events.map((ev) => {
              const overdue = !ev.est_accompli && new Date(ev.date_heure_prevue) < new Date()
              return (
                <Link
                  key={ev.id}
                  to={`/event/${ev.id}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors group ${
                    ev.est_accompli
                      ? 'bg-white border-gray-100 hover:border-green-200 hover:bg-green-50'
                      : overdue
                      ? 'bg-white border-red-100 hover:border-red-300 hover:bg-red-50'
                      : 'bg-white border-gray-100 hover:border-sky-200 hover:bg-sky-50'
                  }`}
                >
                  {ev.est_accompli ? (
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                  ) : overdue ? (
                    <AlertTriangle size={16} className="text-red-400 shrink-0" />
                  ) : (
                    <Clock size={16} className="text-gray-300 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${ev.est_accompli ? 'text-gray-500' : 'text-gray-900'}`}>
                      {ev.obj.nom}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-600">
                        {ev.tevent.nom}
                      </span>
                      {ev.eng_nom && (
                        <span className="text-gray-400 truncate max-w-[140px]">{ev.eng_nom}</span>
                      )}
                      <span>Prévu : {formatDateTime(ev.date_heure_prevue)}</span>
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    {ev.est_accompli ? (
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        {formatDateTime(ev.date_heure_reelle!)}
                      </span>
                    ) : overdue ? (
                      <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">En retard</span>
                    ) : (
                      <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">En attente</span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Pagination (liste uniquement) */}
        {viewMode === 'list' && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>{total} événements au total</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                ← Précédent
              </button>
              <span className="text-xs">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
