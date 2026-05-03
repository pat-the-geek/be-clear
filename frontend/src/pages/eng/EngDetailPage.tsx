import { useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react'
import mermaid from 'mermaid'
import { engApi } from '@/services/api'
import { formatDate, formatDateTime } from '@/lib/utils'
import EntityAvatar from '@/components/shared/EntityAvatar'
import type { Eng, EngEventBrief } from '@/types'

// ─── Composant local : grille de dates ──────────────────────

interface DateGridProps {
  dateDebut?: string
  dateDebutPrevue?: string
  dateFin?: string
  dateFinPrevue?: string
}

function DateGrid({ dateDebut, dateDebutPrevue, dateFin, dateFinPrevue }: DateGridProps) {
  const cells = [
    { label: 'Début', value: dateDebut },
    { label: 'Début prévu', value: dateDebutPrevue },
    { label: 'Fin', value: dateFin },
    { label: 'Fin prévue', value: dateFinPrevue },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {cells.map(({ label, value }) => (
        <div key={label} className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          <p className="text-sm font-medium text-gray-900">{formatDate(value)}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Composant local : diagramme Mermaid ────────────────────

interface GanttDiagramProps {
  id: number
  code: string
}

function GanttDiagram({ id, code }: GanttDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      if (!containerRef.current) return

      mermaid.initialize({ startOnLoad: false, theme: 'neutral' })

      try {
        const diagramId = `gantt-${id}`
        const { svg } = await mermaid.render(diagramId, code)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML =
            '<p class="text-red-500 text-sm">Erreur de rendu du diagramme.</p>'
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [id, code])

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-4"
    />
  )
}

// ─── Composant local : ligne d'EVENT ────────────────────────

interface EventRowProps {
  event: EngEventBrief
}

function EventRow({ event }: EventRowProps) {
  return (
    <Link
      to={`/event/${event.id}`}
      className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-100 rounded-lg hover:border-violet-300 hover:shadow-sm transition-all"
    >
      {event.est_accompli ? (
        <CheckCircle2 size={18} className="text-green-500 shrink-0" />
      ) : (
        <Circle size={18} className="text-gray-300 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{event.obj_nom}</p>
        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700">{event.tevent_nom}</span>
          · Prévu : {formatDateTime(event.date_heure_prevue)}
        </p>
      </div>

      <div className="text-right shrink-0">
        {event.date_heure_reelle ? (
          <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            {formatDateTime(event.date_heure_reelle)}
          </span>
        ) : (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            En attente
          </span>
        )}
      </div>
    </Link>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function EngDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const engId = Number(id)

  const { data: eng, isLoading, isError } = useQuery({
    queryKey: ['eng', engId],
    queryFn: () => engApi.get(engId).then((r) => r.data as Eng),
    enabled: !isNaN(engId),
  })

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400 py-16">Chargement…</div>
    )
  }

  if (isError || !eng) {
    return (
      <div className="p-6 text-center text-red-500 py-16">
        Impossible de charger cet engagement.
      </div>
    )
  }

  const pct = eng.accomplissement ?? 0

  // Trier les events par date_heure_prevue
  const sortedEvents = [...(eng.events ?? [])].sort(
    (a, b) => new Date(a.date_heure_prevue).getTime() - new Date(b.date_heure_prevue).getTime(),
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Retour */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors"
      >
        <ArrowLeft size={15} />
        Retour
      </button>

      {/* ─── En-tête ──────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-start gap-4 mb-2">
          <EntityAvatar
            type="eng"
            nom={eng.obj.nom}
            image={eng.obj.images.find(i => i.est_principale)}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{eng.obj.nom}</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 shrink-0">
                {eng.teng.nom}
              </span>
            </div>

            {/* Barre de progression */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Accomplissement</span>
                <span className={`text-xs font-medium ${pct >= 100 ? 'text-green-700' : pct > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                  {pct}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-gray-300'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>

            {/* ORGs et ENVs associés */}
            <div className="flex flex-wrap gap-2 mt-4">
              {eng.orgs.map((org) => (
                <Link key={org.id} to={`/org/${org.id}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                  {org.nom}
                </Link>
              ))}
              {eng.envs.map((env) => (
                <Link key={env.id} to={`/env/${env.id}`} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors">
                  {env.nom}
                </Link>
              ))}
            </div>
          </div>{/* flex-1 */}
        </div>{/* flex items-start gap-4 */}
      </div>

      {/* ─── Dates ────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Dates
        </h2>
        <DateGrid
          dateDebut={eng.date_debut}
          dateDebutPrevue={eng.date_debut_prevue}
          dateFin={eng.date_fin}
          dateFinPrevue={eng.date_fin_prevue}
        />
      </section>

      {/* ─── Diagramme Gantt ──────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Diagramme Gantt
        </h2>
        {eng.gantt_mermaid ? (
          <GanttDiagram id={engId} code={eng.gantt_mermaid} />
        ) : (
          <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-lg border border-gray-200">
            Aucun évènement
          </div>
        )}
      </section>

      {/* ─── Évènements ───────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Évènements ({sortedEvents.length})
        </h2>
        {sortedEvents.length === 0 ? (
          <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-lg border border-gray-200">
            Aucun évènement
          </div>
        ) : (
          <div className="space-y-2">
            {sortedEvents.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
