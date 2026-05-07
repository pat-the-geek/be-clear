import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, AlertTriangle, Search, X } from 'lucide-react'
import { eventApi } from '@/services/api'
import { formatDateTime } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import type { PaginatedResponse } from '@/types'

interface EventItem {
  id: number
  obj: { nom: string }
  eng_id?: number
  eng_nom?: string
  tevent: { nom: string }
  date_heure_prevue: string
  date_heure_reelle?: string
  est_accompli: boolean
}

interface Props {
  orgId?: number
  envId?: number
  engId?: number
}

type StatusFilter = 'tous' | 'attente' | 'accomplis'

export default function EventsInlineList({ orgId, envId, engId }: Props) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<StatusFilter>('tous')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const accompli =
    status === 'attente' ? false : status === 'accomplis' ? true : undefined

  const { data, isLoading } = useQuery({
    queryKey: ['events', 'inline', orgId, envId, engId, status, dateFrom, dateTo, debouncedSearch],
    queryFn: () =>
      eventApi.list({
        org_id: orgId,
        env_id: envId,
        eng_id: engId,
        accompli,
        q: debouncedSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        per_page: 100,
      }).then((r) => r.data as PaginatedResponse<EventItem>),
  })

  const events = data?.items ?? []

  return (
    <div className="space-y-3">
      {/* Filtres */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { label: 'Tous', value: 'tous' },
          { label: 'En attente', value: 'attente' },
          { label: 'Accomplis', value: 'accomplis' },
        ] as { label: string; value: StatusFilter }[]).map(({ label, value }) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              status === value
                ? 'bg-violet-100 text-violet-800 border-violet-200 font-medium'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="pl-6 pr-5 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 w-36"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-auto text-xs text-gray-500">
          <label className="flex items-center gap-1">
            Du
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </label>
          <label className="flex items-center gap-1">
            Au
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-200 rounded-md px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-gray-400 hover:text-gray-600 text-sm leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="text-sm text-gray-400 py-4 text-center">Chargement…</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center border-2 border-dashed border-gray-200 rounded-xl">
          Aucun événement.
        </div>
      ) : (
        <div className="space-y-1">
          {events.map((ev) => {
            const overdue = !ev.est_accompli && new Date(ev.date_heure_prevue) < new Date()
            return (
              <div
                key={ev.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/event/${ev.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/event/${ev.id}`)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors group cursor-pointer ${
                  ev.est_accompli
                    ? 'bg-white border-gray-100 hover:border-green-200 hover:bg-green-50'
                    : overdue
                    ? 'bg-white border-red-100 hover:border-red-300 hover:bg-red-50'
                    : 'bg-white border-gray-100 hover:border-violet-200 hover:bg-violet-50'
                }`}
              >
                {ev.est_accompli ? (
                  <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                ) : overdue ? (
                  <AlertTriangle size={14} className="text-red-400 shrink-0" />
                ) : (
                  <Clock size={14} className="text-gray-300 shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${ev.est_accompli ? 'text-gray-500' : 'text-gray-900'}`}>
                    {ev.obj.nom}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-violet-50 text-violet-600">
                      {ev.tevent.nom}
                    </span>
                    {ev.eng_nom && !engId && (
                      ev.eng_id ? (
                        <Link
                          to={`/eng/${ev.eng_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate max-w-[140px] hover:text-amber-600 hover:underline transition-colors"
                        >
                          {ev.eng_nom}
                        </Link>
                      ) : (
                        <span className="truncate max-w-[140px]">{ev.eng_nom}</span>
                      )
                    )}
                    <span>{formatDateTime(ev.date_heure_prevue)}</span>
                  </p>
                </div>

                <div className="shrink-0">
                  {ev.est_accompli ? (
                    <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Accompli</span>
                  ) : overdue ? (
                    <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">En retard</span>
                  ) : (
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">En attente</span>
                  )}
                </div>
              </div>
            )
          })}
          {(data?.total ?? 0) > 100 && (
            <p className="text-xs text-gray-400 text-center pt-1">
              Affichage limité à 100 — <Link to="/events" className="text-violet-500 hover:underline">voir tous</Link>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
