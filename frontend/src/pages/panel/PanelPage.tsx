import { useState, useMemo } from 'react'
import { CalendarDays, Clock, ExternalLink, AlertTriangle, TrendingUp, CheckCircle2, BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { usePanel } from '@/hooks/usePanel'
import ObjCard from '@/components/shared/ObjCard'
import { eventApi } from '@/services/api'
import { formatDateTime } from '@/lib/utils'

interface UpcomingEvent {
  id: number
  nom: string
  eng_id: number
  eng_nom: string
  tevent_nom: string
  date_heure_prevue: string
}

export default function PanelPage() {
  const user = useAuthStore((s) => s.user)
  const { data, isLoading, isError } = usePanel()

  const { data: upcoming } = useQuery<UpcomingEvent[]>({
    queryKey: ['events', 'upcoming'],
    queryFn: () => eventApi.upcoming(10).then((r) => r.data),
  })

  const { data: overdue } = useQuery<UpcomingEvent[]>({
    queryKey: ['events', 'overdue'],
    queryFn: () => eventApi.overdue(20).then((r) => r.data),
  })

  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Compute suggested date range from all items
  const { suggestedFrom, suggestedTo } = useMemo(() => {
    if (!data) return { suggestedFrom: '', suggestedTo: '' }
    const allDates = [
      ...data.orgs.map((o) => o.updated_at?.slice(0, 10) ?? ''),
      ...data.envs.map((e) => e.updated_at?.slice(0, 10) ?? ''),
      ...data.engs.map((e) => e.updated_at?.slice(0, 10) ?? ''),
    ].filter(Boolean)
    if (allDates.length === 0) return { suggestedFrom: '', suggestedTo: '' }
    const sorted = [...allDates].sort()
    return { suggestedFrom: sorted[0], suggestedTo: sorted[sorted.length - 1] }
  }, [data])

  function filterByDate<T extends { updated_at?: string }>(items: T[]): T[] {
    return items.filter((item) => {
      const d = item.updated_at?.slice(0, 10) ?? ''
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
  }

  const filteredOrgs = data ? filterByDate(data.orgs) : []
  const filteredEnvs = data ? filterByDate(data.envs) : []
  const filteredEngs = data ? filterByDate(data.engs) : []

  const totalItems =
    (data?.orgs.length ?? 0) + (data?.envs.length ?? 0) + (data?.engs.length ?? 0)

  // ── KPIs calculés depuis les données du panel ──────────────
  const kpis = useMemo(() => {
    if (!data) return null
    const engs = data.engs
    const total = engs.length
    const termines = engs.filter((e) => (e.accomplissement ?? 0) >= 100).length
    const enCours = engs.filter((e) => (e.accomplissement ?? 0) > 0 && (e.accomplissement ?? 0) < 100).length
    const nonDemarres = total - termines - enCours
    const avgPct = total > 0
      ? Math.round(engs.reduce((sum, e) => sum + (e.accomplissement ?? 0), 0) / total)
      : 0
    return { total, termines, enCours, nonDemarres, avgPct }
  }, [data])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Bonjour, {user?.obj?.nom ?? '—'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Vos éléments créés — {totalItems} au total
        </p>
      </div>

      {/* KPIs */}
      {kpis && kpis.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={14} className="text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Engagements</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpis.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-xs text-gray-500 font-medium">Terminés</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{kpis.termines}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-amber-500" />
              <span className="text-xs text-gray-500 font-medium">En cours</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">{kpis.enCours}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-blue-500" />
              <span className="text-xs text-gray-500 font-medium">Avancement moy.</span>
            </div>
            <div className="flex items-end gap-1">
              <p className="text-2xl font-bold text-blue-700">{kpis.avgPct}</p>
              <span className="text-sm text-blue-500 mb-0.5">%</span>
            </div>
            <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-blue-400 transition-all" style={{ width: `${kpis.avgPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Alertes rapides */}
      {(overdue?.length ?? 0) > 0 && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle size={15} />
            <span><strong>{overdue!.length}</strong> événement{overdue!.length > 1 ? 's' : ''} en retard</span>
          </div>
          <Link to="/events?accompli=false" className="text-xs text-red-600 hover:underline font-medium">
            Voir tous →
          </Link>
        </div>
      )}

      {/* Événements en retard */}
      {overdue && overdue.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-red-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertTriangle size={14} />
            Événements en retard ({overdue.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {overdue.map((ev) => (
              <Link
                key={ev.id}
                to={`/event/${ev.id}`}
                className="flex items-start gap-3 p-3 bg-white border border-red-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-colors group"
              >
                <div className="mt-2 w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-red-700">
                    {ev.nom}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{ev.eng_nom}</p>
                  <p className="text-xs text-red-400 mt-0.5">
                    {formatDateTime(ev.date_heure_prevue)}
                    {ev.tevent_nom && (
                      <span className="ml-1.5 px-1 py-0.5 bg-red-50 rounded text-[10px] text-red-400">
                        {ev.tevent_nom}
                      </span>
                    )}
                  </p>
                </div>
                <ExternalLink size={11} className="text-gray-300 group-hover:text-red-400 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Prochains événements */}
      {upcoming && upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock size={14} />
            Prochains événements ({upcoming.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {upcoming.map((ev) => (
              <Link
                key={ev.id}
                to={`/event/${ev.id}`}
                className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-violet-300 hover:bg-violet-50 transition-colors group"
              >
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-2" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-violet-700">
                    {ev.nom}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{ev.eng_nom}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDateTime(ev.date_heure_prevue)}
                    {ev.tevent_nom && (
                      <span className="ml-1.5 px-1 py-0.5 bg-gray-100 rounded text-[10px] text-gray-500">
                        {ev.tevent_nom}
                      </span>
                    )}
                  </p>
                </div>
                <ExternalLink size={11} className="text-gray-300 group-hover:text-violet-400 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Filtre par période */}
      {data && (
        <div className="flex items-center gap-3 mb-6 text-sm">
          <CalendarDays size={16} className="text-gray-400 shrink-0" />
          <span className="text-gray-500 font-medium">Période :</span>
          <label className="flex items-center gap-1.5 text-gray-500">
            Du
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder={suggestedFrom}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="flex items-center gap-1.5 text-gray-500">
            Au
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder={suggestedTo}
              className="border border-gray-200 rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-gray-400 hover:text-gray-600 text-base leading-none"
              aria-label="Réinitialiser les dates"
            >
              ×
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="text-center text-gray-400 py-16">Chargement…</div>
      )}

      {isError && (
        <div className="text-center text-red-500 py-16">
          Impossible de charger le panel.
        </div>
      )}

      {data && (
        <div className="space-y-8">
          {/* Organisations */}
          {filteredOrgs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Organisations ({filteredOrgs.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredOrgs.map((org) => (
                  <ObjCard
                    key={org.id}
                    id={org.id}
                    nom={org.nom}
                    type="org"
                    imagePrincipale={org.image_principale ?? undefined}
                    badge={org.torg.nom}
                    badgeColor="bg-blue-100 text-blue-700"
                    updatedAt={org.updated_at}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Environnements */}
          {filteredEnvs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Environnements ({filteredEnvs.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredEnvs.map((env) => (
                  <ObjCard
                    key={env.id}
                    id={env.id}
                    nom={env.nom}
                    type="env"
                    imagePrincipale={env.image_principale ?? undefined}
                    badge={env.tenv.nom}
                    badgeColor="bg-orange-100 text-orange-700"
                    updatedAt={env.updated_at}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Engagements */}
          {filteredEngs.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Engagements ({filteredEngs.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredEngs.map((eng) => {
                  const pct = eng.accomplissement
                  return (
                    <ObjCard
                      key={eng.id}
                      id={eng.id}
                      nom={eng.nom}
                      type="eng"
                      badge={pct != null ? `${pct}%` : undefined}
                      badgeColor={
                        pct == null  ? undefined
                          : pct >= 100 ? 'bg-green-100 text-green-700'
                          : pct > 0    ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }
                      updatedAt={eng.updated_at}
                    />
                  )
                })}
              </div>
            </section>
          )}

          {filteredOrgs.length === 0 && filteredEnvs.length === 0 && filteredEngs.length === 0 && (
            <div className="text-center text-gray-400 py-16">
              Aucun élément créé pour l'instant.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
