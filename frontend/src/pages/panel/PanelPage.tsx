import { useState, useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePanel } from '@/hooks/usePanel'
import ObjCard from '@/components/shared/ObjCard'

export default function PanelPage() {
  const user = useAuthStore((s) => s.user)
  const { data, isLoading, isError } = usePanel()

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
