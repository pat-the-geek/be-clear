import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { eventApi } from '@/services/api'
import { formatDateTime } from '@/lib/utils'
import type { PaginatedResponse } from '@/types'

interface EventItem {
  id: number
  obj: { nom: string }
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

export default function EventsInlineList({ orgId, envId, engId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['events', 'inline', orgId, envId, engId],
    queryFn: () =>
      eventApi.list({
        org_id: orgId,
        env_id: envId,
        eng_id: engId,
        per_page: 100,
      }).then((r) => r.data as PaginatedResponse<EventItem>),
  })

  const events = data?.items ?? []

  if (isLoading) {
    return <div className="text-sm text-gray-400 py-4 text-center">Chargement…</div>
  }

  if (events.length === 0) {
    return (
      <div className="text-sm text-gray-400 py-6 text-center border-2 border-dashed border-gray-200 rounded-xl">
        Aucun événement.
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {events.map((ev) => {
        const overdue = !ev.est_accompli && new Date(ev.date_heure_prevue) < new Date()
        return (
          <Link
            key={ev.id}
            to={`/event/${ev.id}`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors group ${
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
                  <span className="truncate max-w-[140px]">{ev.eng_nom}</span>
                )}
                <span>{formatDateTime(ev.date_heure_prevue)}</span>
              </p>
            </div>

            <div className="shrink-0">
              {ev.est_accompli ? (
                <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  Accompli
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
      {(data?.total ?? 0) > 100 && (
        <p className="text-xs text-gray-400 text-center pt-1">
          Affichage limité à 100 — <Link to="/events" className="text-violet-500 hover:underline">voir tous</Link>
        </p>
      )}
    </div>
  )
}
