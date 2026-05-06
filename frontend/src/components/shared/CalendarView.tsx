import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { eventApi } from '@/services/api'
import type { PaginatedResponse } from '@/types'

interface CalendarEvent {
  id: number
  obj: { nom: string }
  eng_nom?: string
  date_heure_prevue: string
  date_heure_reelle?: string
  est_accompli: boolean
}

interface Props {
  orgId?: number
  envId?: number
  engId?: number
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function CalendarView({ orgId, envId, engId }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const dateFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const dateTo = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, isLoading } = useQuery({
    queryKey: ['events', 'calendar', orgId, envId, engId, year, month],
    queryFn: () =>
      eventApi.list({
        org_id: orgId,
        env_id: envId,
        eng_id: engId,
        date_from: dateFrom,
        date_to: dateTo,
        per_page: 200,
      }).then((r) => r.data as PaginatedResponse<CalendarEvent>),
  })

  const events = data?.items ?? []

  // Group events by ISO date string (YYYY-MM-DD)
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const day = ev.date_heure_prevue.slice(0, 10)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(ev)
    }
    return map
  }, [events])

  // Build calendar grid: 6 weeks × 7 days
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1)
    // Monday-based: getDay() returns 0=Sun → adjust to Monday=0
    let startOffset = firstDayOfMonth.getDay() - 1
    if (startOffset < 0) startOffset = 6

    const days: (Date | null)[] = Array(startOffset).fill(null)
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(year, month, d))
    }
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [year, month, lastDay])

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  const todayStr = now.toISOString().slice(0, 10)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {isLoading && (
        <div className="text-center text-gray-400 py-8 text-sm">Chargement…</div>
      )}

      {!isLoading && (
        <div>
          {/* Day names header */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-400">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {calendarDays.map((date, idx) => {
              const dayStr = date ? date.toISOString().slice(0, 10) : null
              const dayEvents = dayStr ? (eventsByDay.get(dayStr) ?? []) : []
              const isToday = dayStr === todayStr

              return (
                <div
                  key={idx}
                  className={`min-h-[72px] p-1 border-b border-gray-100 ${
                    date ? '' : 'bg-gray-50'
                  } ${idx % 7 === 5 || idx % 7 === 6 ? 'bg-gray-50/50' : ''}`}
                >
                  {date && (
                    <>
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 text-xs rounded-full mb-1 ${
                          isToday
                            ? 'bg-violet-600 text-white font-bold'
                            : 'text-gray-500'
                        }`}
                      >
                        {date.getDate()}
                      </span>

                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const overdue = !ev.est_accompli && new Date(ev.date_heure_prevue) < new Date()
                          return (
                            <Link
                              key={ev.id}
                              to={`/event/${ev.id}`}
                              title={ev.obj.nom + (ev.eng_nom ? ` — ${ev.eng_nom}` : '')}
                              className={`block truncate text-[10px] px-1 py-0.5 rounded font-medium leading-tight ${
                                ev.est_accompli
                                  ? 'bg-green-100 text-green-700'
                                  : overdue
                                  ? 'bg-red-100 text-red-600'
                                  : 'bg-violet-100 text-violet-700'
                              }`}
                            >
                              {ev.obj.nom}
                            </Link>
                          )
                        })}
                        {dayEvents.length > 3 && (
                          <p className="text-[10px] text-gray-400 px-1">
                            +{dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-200 inline-block" /> À venir</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-200 inline-block" /> Accompli</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-200 inline-block" /> En retard</span>
        {events.length > 0 && <span className="ml-auto">{events.length} événement{events.length > 1 ? 's' : ''} ce mois</span>}
      </div>
    </div>
  )
}
