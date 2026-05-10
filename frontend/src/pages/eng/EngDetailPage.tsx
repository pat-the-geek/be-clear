import { useState, useEffect, useRef, useCallback } from 'react'
import { useAutoResize } from '@/hooks/useAutoResize'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Circle, Edit, Trash2, Plus, Loader2, Pencil, X, Download, FileText, List, CalendarDays, GanttChartSquare, AlertTriangle, Copy, Square, CheckSquare } from 'lucide-react'
import MarkdownContent from '@/components/shared/MarkdownContent'
import { engApi, eventApi, teventApi, claApi } from '@/services/api'
import { formatDate, formatDateTime } from '@/lib/utils'
import EntityAvatar from '@/components/shared/EntityAvatar'
import { Modal } from '@/components/shared/Modal'
import SmartImage from '@/components/shared/SmartImage'
import UrlValueDisplay from '@/components/shared/UrlValueDisplay'
import { imgUrl } from '@/components/shared/ImageManager'
import { useAuthStore } from '@/stores/authStore'
import type { Eng, EngEventBrief, Tevent, Event as AppEvent, Prop, Value } from '@/types'
import ValueField, { type ValueDraft, emptyDraft } from '@/components/shared/ValueField'
import CalendarView from '@/components/shared/CalendarView'
import LogTimeline from '@/components/shared/LogTimeline'
import { toast } from '@/lib/toast'

// ─── Helpers date ────────────────────────────────────────────

function isoToDatetimeLocal(iso?: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function datetimeLocalToIso(val: string): string {
  return val ? `${val}:00` : ''
}

function parseApiError(error: unknown): string | null {
  const raw = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (!raw) return null
  if (typeof raw === 'string') {
    if (raw.startsWith('RF-15')) {
      const match = raw.match(/date_debut de l'ENG \(([^)]+)\)/)
      const dateDebut = match?.[1]
      return dateDebut
        ? `La date prévue ne peut pas être antérieure au début de l'engagement (${dateDebut}).`
        : "La date prévue ne peut pas être antérieure à la date de début de l'engagement."
    }
    return raw
  }
  if (Array.isArray(raw)) return (raw as { msg?: string }[]).map((e) => e.msg ?? JSON.stringify(e)).join(' · ')
  return JSON.stringify(raw)
}

// ─── Composant : grille de dates ─────────────────────────────

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

// ─── Composant : modal diagramme Mermaid (plein écran) ───────

interface MermaidModalProps {
  open: boolean
  onClose: () => void
  id: string
  code: string
  title: string
  stripInit?: boolean
}

function MermaidModal({ open, onClose, id, code, title, stripInit = false }: MermaidModalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [isRendering, setIsRendering] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsRendering(true)

    const renderCode = stripInit ? code.replace(/^%%\{[\s\S]*?\}%%\s*/m, '') : code
    const renderId = `mermaid-${id}`

    async function render() {
      document.getElementById(`d${renderId}`)?.remove()
      document.getElementById(`i${renderId}`)?.remove()
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', suppressErrorRendering: true })
        const { svg } = await mermaid.render(renderId, renderCode)
        document.getElementById(`d${renderId}`)?.remove()
        document.getElementById(`i${renderId}`)?.remove()
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          const svgEl = containerRef.current.querySelector('svg')
          if (svgEl) {
            const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
            style.textContent = 'line, polyline { stroke: #1e293b !important; stroke-width: 2px !important; }'
            svgEl.appendChild(style)
            svgEl.removeAttribute('width')
            svgEl.removeAttribute('height')
            svgEl.style.width = '100%'
            svgEl.style.height = 'auto'
            svgEl.style.minWidth = '600px'
          }
        }
      } catch {
        document.getElementById(`d${renderId}`)?.remove()
        document.getElementById(`i${renderId}`)?.remove()
        if (!cancelled && containerRef.current)
          containerRef.current.innerHTML = '<p class="text-red-500 text-sm">Erreur de rendu du diagramme.</p>'
      } finally {
        if (!cancelled) setIsRendering(false)
      }
    }

    render()

    return () => {
      cancelled = true
      document.getElementById(`d${renderId}`)?.remove()
      document.getElementById(`i${renderId}`)?.remove()
    }
  }, [open, id, code, stripInit])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto"
      onClick={() => onCloseRef.current()}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-[96vw] my-4 p-8 min-h-[160px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onCloseRef.current()}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">{title}</h3>
        {isRendering && (
          <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Génération du diagramme…</span>
          </div>
        )}
        <div ref={containerRef} className={`overflow-x-auto ${isRendering ? 'hidden' : ''}`} />
      </div>
    </div>,
    document.body
  )
}

// ─── Composant : Gantt React custom ──────────────────────────

const GANTT_LEFT_COL = 220 // px — largeur colonne noms

function GanttModal({ open, onClose, eng }: { open: boolean; onClose: () => void; eng: Eng }) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  const events = [...(eng.events ?? [])].sort(
    (a, b) => new Date(a.date_heure_prevue).getTime() - new Date(b.date_heure_prevue).getTime(),
  )

  const now = new Date()

  // Plage de dates du chart
  const allTs: number[] = []
  for (const ev of events) {
    allTs.push(new Date(ev.date_heure_prevue).getTime())
    if (ev.date_heure_reelle) allTs.push(new Date(ev.date_heure_reelle).getTime())
  }
  const minTs = allTs.length ? Math.min(...allTs) : now.getTime()
  const maxTs = allTs.length ? Math.max(...allTs) : now.getTime() + 7 * 86400_000
  const spanMs = Math.max(maxTs - minTs, 7 * 86400_000)
  const padMs = Math.max(spanMs * 0.08, 2 * 86400_000)
  const chartStart = new Date(minTs - padMs)
  const chartEnd = new Date(maxTs + padMs * 2)
  const chartMs = chartEnd.getTime() - chartStart.getTime()

  const toLeft = (d: Date) =>
    Math.max(0, Math.min(100, (d.getTime() - chartStart.getTime()) / chartMs * 100))
  const toWidth = (s: Date, e: Date) =>
    Math.max(0.4, (e.getTime() - s.getTime()) / chartMs * 100)

  // Graduations temporelles
  const spanDays = chartMs / 86400_000
  const useMonthly = spanDays > 70
  const useWeekly = spanDays > 14 && !useMonthly

  const ticks: Date[] = []
  const tickCursor = new Date(chartStart)
  if (useMonthly) {
    tickCursor.setDate(1); tickCursor.setHours(0, 0, 0, 0)
    tickCursor.setMonth(tickCursor.getMonth() + 1)
    while (tickCursor <= chartEnd) { ticks.push(new Date(tickCursor)); tickCursor.setMonth(tickCursor.getMonth() + 1) }
  } else if (useWeekly) {
    tickCursor.setHours(0, 0, 0, 0)
    const dow = tickCursor.getDay()
    tickCursor.setDate(tickCursor.getDate() + (dow === 1 ? 0 : (8 - dow) % 7))
    while (tickCursor <= chartEnd) { ticks.push(new Date(tickCursor)); tickCursor.setDate(tickCursor.getDate() + 7) }
  } else {
    tickCursor.setHours(0, 0, 0, 0); tickCursor.setDate(tickCursor.getDate() + 1)
    while (tickCursor <= chartEnd) { ticks.push(new Date(tickCursor)); tickCursor.setDate(tickCursor.getDate() + 1) }
  }

  const formatTick = (d: Date) =>
    useMonthly
      ? d.toLocaleDateString('fr-CH', { month: 'short', year: '2-digit' })
      : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

  // Sections par TEVENT
  const sections = new Map<string, typeof events>()
  for (const ev of events) {
    const key = ev.tevent_nom ?? 'Évènements'
    if (!sections.has(key)) sections.set(key, [])
    sections.get(key)!.push(ev)
  }

  const sectionEntries = [...sections.entries()]
  const showToday = now >= chartStart && now <= chartEnd
  const todayLeft = toLeft(now)

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto"
      onClick={() => onCloseRef.current()}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-[96vw] my-4 p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onCloseRef.current()}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          <X size={18} />
        </button>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Gantt</p>
        <p className="text-lg font-bold text-gray-800 mb-4">{eng.obj.nom}</p>

        {/* Légende */}
        <div className="flex flex-wrap items-center gap-4 mb-5 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2.5 rounded-sm bg-green-500" />Accompli</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2.5 rounded-sm bg-violet-500" />Planifié</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-2.5 rounded-sm bg-red-400" />En retard</span>
          {showToday && (
            <span className="flex items-center gap-1.5"><span className="inline-block w-0.5 h-4 bg-amber-400" />Aujourd'hui</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: '680px' }}>
            <div className="border border-gray-200 rounded-lg overflow-hidden">

              {/* En-tête avec axe temporel */}
              <div className="flex border-b-2 border-gray-300 bg-gray-50">
                <div
                  style={{ width: GANTT_LEFT_COL, minWidth: GANTT_LEFT_COL }}
                  className="shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-r-2 border-gray-300"
                >
                  Évènement
                </div>
                <div className="flex-1 relative h-9 overflow-hidden">
                  {ticks.map((tick, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full flex flex-col justify-end"
                      style={{ left: `${toLeft(tick)}%` }}
                    >
                      <div className="absolute top-0 w-px h-full bg-gray-300" />
                      <span className="relative pl-1 pb-1 text-xs text-gray-400 whitespace-nowrap leading-none select-none">
                        {formatTick(tick)}
                      </span>
                    </div>
                  ))}
                  {showToday && (
                    <div
                      className="absolute top-0 h-full flex flex-col justify-end z-10"
                      style={{ left: `${todayLeft}%` }}
                    >
                      <div className="absolute top-0 w-0.5 h-full bg-amber-400" />
                      <span className="relative pl-1 pb-1 text-xs font-bold text-amber-600 whitespace-nowrap leading-none select-none">
                        Auj.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sections et lignes d'EVENTs */}
              {sectionEntries.map(([section, sectionEvents], sIdx) => (
                <div key={section}>
                  {/* En-tête section */}
                  <div className="flex bg-violet-50 border-b border-violet-100">
                    <div
                      style={{ width: GANTT_LEFT_COL, minWidth: GANTT_LEFT_COL }}
                      className="shrink-0 px-3 py-1.5 text-xs font-semibold text-violet-700 border-r-2 border-gray-300"
                    >
                      {section}
                    </div>
                    <div className="flex-1 relative h-7">
                      {ticks.map((tick, i) => (
                        <div
                          key={i}
                          className="absolute top-0 h-full w-px bg-violet-200"
                          style={{ left: `${toLeft(tick)}%` }}
                        />
                      ))}
                      {showToday && (
                        <div
                          className="absolute top-0 h-full w-0.5 bg-amber-300 z-10"
                          style={{ left: `${todayLeft}%` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Lignes d'EVENTs */}
                  {sectionEvents.map((ev, evIdx) => {
                    const startDate = new Date(ev.date_heure_prevue)
                    let endDate = ev.date_heure_reelle ? new Date(ev.date_heure_reelle) : null
                    if (!endDate || endDate <= startDate) {
                      endDate = new Date(startDate.getTime() + 86400_000)
                    }

                    const isOverdue = !ev.est_accompli && startDate < now
                    const barBg = ev.est_accompli
                      ? 'bg-green-500'
                      : isOverdue
                      ? 'bg-red-400'
                      : 'bg-violet-500'

                    const isLastInSection = evIdx === sectionEvents.length - 1
                    const isLastSection = sIdx === sectionEntries.length - 1

                    return (
                      <div
                        key={ev.id}
                        className={`flex hover:bg-gray-50 transition-colors ${
                          isLastInSection && !isLastSection
                            ? 'border-b-2 border-gray-200'
                            : isLastInSection
                            ? ''
                            : 'border-b border-gray-100'
                        }`}
                      >
                        {/* Nom de l'EVENT */}
                        <div
                          style={{ width: GANTT_LEFT_COL, minWidth: GANTT_LEFT_COL }}
                          className="shrink-0 px-3 py-0 text-sm text-gray-700 border-r-2 border-gray-300 flex items-center h-11"
                        >
                          <span className="truncate" title={ev.obj_nom}>{ev.obj_nom}</span>
                        </div>

                        {/* Zone de la barre */}
                        <div className="flex-1 relative h-11 overflow-hidden">
                          {/* Lignes de grille verticales */}
                          {ticks.map((tick, i) => (
                            <div
                              key={i}
                              className="absolute top-0 h-full w-px bg-gray-100"
                              style={{ left: `${toLeft(tick)}%` }}
                            />
                          ))}
                          {/* Ligne Aujourd'hui */}
                          {showToday && (
                            <div
                              className="absolute top-0 h-full w-0.5 bg-amber-300/70 z-10"
                              style={{ left: `${todayLeft}%` }}
                            />
                          )}
                          {/* Barre de l'EVENT */}
                          <div
                            className={`absolute top-2.5 h-6 rounded-md shadow-sm ${barBg}`}
                            style={{
                              left: `${toLeft(startDate)}%`,
                              width: `max(${toWidth(startDate, endDate)}%, 8px)`,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {events.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-sm">Aucun évènement à afficher.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Référence stable pour éviter qu'un `= []` inline recrée un tableau à chaque render
// et déclenche une boucle infinie dans les useEffect qui dépendent de claProps.
const EMPTY_PROPS: Prop[] = []

// ─── Composant : modal création EVENT ────────────────────────

interface EventCreateModalProps {
  open: boolean
  onClose: () => void
  engId: number
  onCreated: () => void
}

function EventCreateModal({ open, onClose, engId, onCreated }: EventCreateModalProps) {
  const [nom, setNom] = useState('')
  const [teventId, setTeventId] = useState<number | null>(null)
  const [dateHeurePrevue, setDateHeurePrevue] = useState('')
  const [description, setDescription] = useState('')
  const descRef = useAutoResize(description)
  const autoNomRef = useRef('')
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())

  const { data: tevents } = useQuery({
    queryKey: ['tevent', 'list'],
    queryFn: () => teventApi.list().then((r) => r.data as Tevent[]),
    enabled: open,
  })

  const selectedTevent = tevents?.find((t) => t.id === teventId)
  const claId = selectedTevent?.cla?.id ?? null

  const { data: claProps = EMPTY_PROPS, isFetching: propsLoading } = useQuery({
    queryKey: ['cla-props-all', claId],
    queryFn: () => claApi.propsAll(claId!).then((r) => r.data as Prop[]),
    enabled: !!claId,
  })

  const { data: suggested } = useQuery({
    queryKey: ['event', 'suggest', engId],
    queryFn: () => eventApi.suggest(engId).then((r) => r.data as { date_heure_prevue_suggere: string }),
    enabled: open,
  })

  useEffect(() => {
    if (suggested?.date_heure_prevue_suggere) {
      setDateHeurePrevue(isoToDatetimeLocal(suggested.date_heure_prevue_suggere))
    }
  }, [suggested])

  useEffect(() => {
    if (open) {
      setDateHeurePrevue(isoToDatetimeLocal(new Date().toISOString()))
    } else {
      setNom('')
      setTeventId(null)
      setDateHeurePrevue('')
      setDescription('')
      setDrafts(new Map())
      autoNomRef.current = ''
    }
  }, [open])

  useEffect(() => {
    setDrafts(new Map(claProps.map((p) => [p.id, emptyDraft(p.id)])))
  }, [claProps])

  const handleTeventChange = useCallback((id: number | null) => {
    setTeventId(id)
    if (id) {
      const t = tevents?.find((x) => x.id === id)
      if (t && (nom === '' || nom === autoNomRef.current)) {
        setNom(t.nom)
        autoNomRef.current = t.nom
      }
    }
  }, [tevents, nom])

  const [validationError, setValidationError] = useState<string | null>(null)

  const { mutate: create, isPending, error, reset } = useMutation({
    mutationFn: () =>
      eventApi.create({
        eng_id: engId,
        tevent_id: teventId!,
        nom: nom.trim(),
        description: description.trim() || undefined,
        cla_id: selectedTevent?.cla?.id,
        date_heure_prevue: datetimeLocalToIso(dateHeurePrevue),
        values: Array.from(drafts.values()),
      }),
    onSuccess: () => {
      onCreated()
      onClose()
      reset()
    },
  })

  const apiError = parseApiError(error)

  function handleSubmit() {
    setValidationError(null)
    if (!teventId) { setValidationError('Veuillez sélectionner un type d\'évènement.'); return }
    if (!nom.trim()) { setValidationError('Le nom est obligatoire.'); return }
    if (!dateHeurePrevue) { setValidationError('La date et heure prévues sont obligatoires.'); return }
    create()
  }

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white'

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un évènement" size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Type d'évènement <span className="text-red-500">*</span>
          </label>
          <select
            className={inputClass}
            value={teventId ?? ''}
            onChange={(e) => { setValidationError(null); handleTeventChange(e.target.value ? Number(e.target.value) : null) }}
          >
            <option value="">— Choisir un type —</option>
            {(tevents ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.nom}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Nom <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={inputClass}
            value={nom}
            onChange={(e) => { setValidationError(null); setNom(e.target.value); autoNomRef.current = '' }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Date et heure prévues <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            className={inputClass}
            value={dateHeurePrevue}
            onChange={(e) => { setValidationError(null); setDateHeurePrevue(e.target.value) }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
            Description
          </label>
          <textarea
            ref={descRef}
            className={`${inputClass} font-mono resize-none min-h-[80px]`}
            placeholder="Description en Markdown…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {propsLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
            <Loader2 size={12} className="animate-spin" /> Chargement des propriétés…
          </div>
        )}

        {claProps.length > 0 && !propsLoading && (
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Propriétés ({claProps.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {claProps.map((prop) => (
                <ValueField
                  key={prop.id}
                  propId={prop.id}
                  propNom={prop.nom}
                  propType={prop.type}
                  valeursList={prop.valeurs_liste}
                  draft={drafts.get(prop.id) ?? emptyDraft(prop.id)}
                  onChange={(updated) => setDrafts((prev) => new Map(prev).set(updated.prop_id, updated))}
                />
              ))}
            </div>
          </div>
        )}

        {(validationError || apiError) && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {validationError ?? apiError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Créer
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Composant : modal édition EVENT ─────────────────────────

interface EventEditModalProps {
  open: boolean
  onClose: () => void
  eventId: number | null
  onUpdated: () => void
}

function EventEditModal({ open, onClose, eventId, onUpdated }: EventEditModalProps) {
  const [nom, setNom] = useState('')
  const [teventId, setTeventId] = useState<number | null>(null)
  const [dateHeurePrevue, setDateHeurePrevue] = useState('')
  const [dateHeureReelle, setDateHeureReelle] = useState('')
  const [description, setDescription] = useState('')
  const descEditRef = useAutoResize(description)
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())

  const { data: fullEvent } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => eventApi.get(eventId!).then((r) => r.data as AppEvent),
    enabled: open && eventId !== null,
  })

  const { data: tevents } = useQuery({
    queryKey: ['tevent', 'list'],
    queryFn: () => teventApi.list().then((r) => r.data as Tevent[]),
    enabled: open,
  })

  const claId = fullEvent?.obj?.cla?.id ?? null
  const { data: claProps = EMPTY_PROPS } = useQuery({
    queryKey: ['cla-props-all', claId],
    queryFn: () => claApi.propsAll(claId!).then((r) => r.data as Prop[]),
    enabled: !!claId,
  })

  useEffect(() => {
    if (fullEvent) {
      setNom(fullEvent.obj.nom)
      setTeventId(fullEvent.tevent.id)
      setDateHeurePrevue(isoToDatetimeLocal(fullEvent.date_heure_prevue))
      setDateHeureReelle(isoToDatetimeLocal(fullEvent.date_heure_reelle))
      setDescription(fullEvent.obj.description ?? '')
      const map = new Map<number, ValueDraft>()
      for (const val of fullEvent.obj.values) {
        map.set(val.prop.id, {
          prop_id: val.prop.id,
          valeur_texte: val.valeur_texte ?? null,
          valeur_date: val.valeur_date ?? null,
          valeur_nombre: val.valeur_nombre ?? null,
          valeur_bool: val.valeur_bool ?? null,
          valeur_json: val.valeur_json ?? null,
          valeur_ref_obj_id: val.valeur_ref_obj_id ?? null,
        })
      }
      setDrafts(map)
    }
  }, [fullEvent])

  useEffect(() => {
    if (claProps.length > 0 && fullEvent) {
      setDrafts((prev) => {
        const next = new Map(prev)
        for (const p of claProps) {
          if (!next.has(p.id)) next.set(p.id, emptyDraft(p.id))
        }
        return next
      })
    }
  }, [claProps, fullEvent])

  useEffect(() => {
    if (!open) {
      setNom('')
      setTeventId(null)
      setDateHeurePrevue('')
      setDateHeureReelle('')
      setDescription('')
      setDrafts(new Map())
    }
  }, [open])

  const { mutateAsync: update, isPending, error, reset } = useMutation({
    mutationFn: () =>
      eventApi.update(eventId!, {
        nom: nom.trim() || undefined,
        tevent_id: teventId || undefined,
        date_heure_prevue: dateHeurePrevue ? datetimeLocalToIso(dateHeurePrevue) : undefined,
        date_heure_reelle: dateHeureReelle ? datetimeLocalToIso(dateHeureReelle) : undefined,
        description: description.trim() || null,
        values: Array.from(drafts.values()),
      }),
  })

  const apiError = parseApiError(error)

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white'

  return (
    <Modal open={open} onClose={onClose} title="Modifier l'évènement" size="md">
      <div className="space-y-4">
        {!fullEvent ? (
          <div className="flex justify-center py-6 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={inputClass}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Type d'évènement
              </label>
              <select
                className={inputClass}
                value={teventId ?? ''}
                onChange={(e) => setTeventId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— Choisir —</option>
                {(tevents ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.nom}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Date et heure prévues
              </label>
              <input
                type="datetime-local"
                className={inputClass}
                value={dateHeurePrevue}
                onChange={(e) => setDateHeurePrevue(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Date et heure réelles
                </label>
                {!dateHeureReelle && (
                  <button
                    type="button"
                    onClick={() => setDateHeureReelle(isoToDatetimeLocal(new Date().toISOString()))}
                    className="text-xs text-green-600 hover:underline font-medium"
                  >
                    Maintenant
                  </button>
                )}
                {dateHeureReelle && (
                  <button
                    type="button"
                    onClick={() => setDateHeureReelle('')}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Effacer
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                className={inputClass}
                value={dateHeureReelle}
                onChange={(e) => setDateHeureReelle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Description <span className="text-gray-400 font-normal normal-case">(Markdown)</span>
              </label>
              <textarea
                ref={descEditRef}
                className={`${inputClass} font-mono resize-none min-h-[80px]`}
                placeholder="Description en Markdown…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {claProps.length > 0 && (
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                  Propriétés ({claProps.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {claProps.map((prop) => (
                    <ValueField
                      key={prop.id}
                      propId={prop.id}
                      propNom={prop.nom}
                      propType={prop.type}
                      valeursList={prop.valeurs_liste}
                      draft={drafts.get(prop.id) ?? emptyDraft(prop.id)}
                      onChange={(updated) => setDrafts((prev) => new Map(prev).set(updated.prop_id, updated))}
                    />
                  ))}
                </div>
              </div>
            )}

            {apiError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {apiError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={async () => { try { await update(); onUpdated(); onClose(); reset() } catch { /* error shown via apiError */ } }}
                disabled={isPending || !nom.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Enregistrer
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ─── Composant : carte PROP / VALUE ──────────────────────────

function PropValueCard({ prop, value }: { prop: Prop; value?: Value }) {
  const type = prop.type
  let display: React.ReactNode = <span className="text-gray-400">—</span>

  if (value) {
    if ((type === 'DATE') && value.valeur_date) {
      display = formatDate(value.valeur_date)
    } else if ((type === 'DATETIME' || type === 'HEURE') && value.valeur_date) {
      display = formatDateTime(value.valeur_date)
    } else if (type === 'BOOLEEN') {
      display = value.valeur_bool === true
        ? <span className="text-green-700 font-medium">Oui</span>
        : value.valeur_bool === false
        ? <span className="text-red-600 font-medium">Non</span>
        : <span className="text-gray-400">—</span>
    } else if (type === 'MONTANT' && value.valeur_nombre != null) {
      display = new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' }).format(value.valeur_nombre)
    } else if (type === 'POURCENTAGE' && value.valeur_nombre != null) {
      display = `${value.valeur_nombre} %`
    } else if (value.valeur_nombre != null) {
      display = String(value.valeur_nombre)
    } else if (type === 'MARKDOWN' && value.valeur_texte) {
      display = <MarkdownContent>{value.valeur_texte}</MarkdownContent>
    } else if (type === 'URL' && value.valeur_texte) {
      display = <UrlValueDisplay url={value.valeur_texte} />
    } else if (type === 'EMAIL' && value.valeur_texte) {
      display = <a href={`mailto:${value.valeur_texte}`} className="text-blue-600 hover:underline">{value.valeur_texte}</a>
    } else if (value.valeur_texte) {
      display = value.valeur_texte
    }
  }

  const isWide = type === 'MARKDOWN' || type === 'TEXTE'
  return (
    <div className={`flex flex-col gap-1 ${isWide ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{prop.nom}</span>
      <div className="text-sm text-gray-900">{display}</div>
    </div>
  )
}

// ─── Composant : ligne d'EVENT ───────────────────────────────

interface EventRowProps {
  event: EngEventBrief
  isEditeur: boolean
  onEdit: () => void
  onDelete: (id: number) => void
  onAccomplir: (id: number) => void
  isDeleting: boolean
  isAccomplishing: boolean
  selected?: boolean
  onToggleSelect?: (id: number) => void
}

function EventRow({ event, isEditeur, onEdit, onDelete, onAccomplir, isDeleting, isAccomplishing, selected, onToggleSelect }: EventRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isOverdue = !event.est_accompli && new Date(event.date_heure_prevue) < new Date()

  return (
    <div className="group flex items-center gap-2">
      {isEditeur && !event.est_accompli && (
        <button
          type="button"
          onClick={() => onToggleSelect?.(event.id)}
          className={`shrink-0 transition-colors ${selected ? 'text-violet-600' : 'text-gray-300 hover:text-violet-400'}`}
          title={selected ? 'Désélectionner' : 'Sélectionner'}
        >
          {selected ? <CheckSquare size={16} /> : <Square size={16} />}
        </button>
      )}
      <Link
        to={`/event/${event.id}`}
        className={`flex-1 flex items-center gap-3 p-3 border rounded-lg hover:shadow-sm transition-all min-w-0 ${
          event.est_accompli
            ? 'bg-green-50 border-green-100 hover:border-green-300'
            : isOverdue
            ? 'bg-red-50 border-red-200 hover:border-red-400'
            : 'bg-violet-50 border-violet-100 hover:border-violet-300'
        }`}
      >
        {event.est_accompli ? (
          <CheckCircle2 size={18} className="text-green-500 shrink-0" />
        ) : isOverdue ? (
          <AlertTriangle size={18} className="text-red-400 shrink-0" />
        ) : (
          <Circle size={18} className="text-gray-300 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>
            {event.obj_nom}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${isOverdue ? 'bg-red-100 text-red-600' : 'bg-violet-100 text-violet-700'}`}>
              {event.tevent_nom}
            </span>
            · Prévu : {formatDateTime(event.date_heure_prevue)}
          </p>
        </div>

        <div className="text-right shrink-0">
          {event.date_heure_reelle ? (
            <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
              {formatDateTime(event.date_heure_reelle)}
            </span>
          ) : isOverdue ? (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              En retard
            </span>
          ) : (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              En attente
            </span>
          )}
        </div>
      </Link>

      {isEditeur && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pointer-events-none group-hover:pointer-events-auto">
          {confirmDelete ? (
            <>
              <button
                onClick={() => { onDelete(event.id); setConfirmDelete(false) }}
                disabled={isDeleting}
                className="px-2 py-1 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? '…' : 'Confirmer'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              {!event.est_accompli && (
                <button
                  onClick={() => onAccomplir(event.id)}
                  disabled={isAccomplishing}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-green-600 transition-colors disabled:opacity-50"
                  title="Marquer accompli"
                >
                  {isAccomplishing ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                </button>
              )}
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-violet-600 transition-colors"
                title="Modifier"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"
                title="Supprimer"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function EngDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditeur = useAuthStore((s) => s.isEditeur)

  const engId = Number(id)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [editingEventId, setEditingEventId] = useState<number | null>(null)
  const [eventsView, setEventsView] = useState<'list' | 'calendar'>('list')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const descRef = useAutoResize(descDraft)
  const [selectedEventIds, setSelectedEventIds] = useState<Set<number>>(new Set())
  const [showTimeline, setShowTimeline] = useState(false)
  const [showGantt, setShowGantt] = useState(false)

  const { data: eng, isLoading, isError } = useQuery({
    queryKey: ['eng', engId],
    queryFn: () => engApi.get(engId).then((r) => r.data as Eng),
    enabled: !isNaN(engId),
  })

  const { mutate: deleteEng, isPending: isDeleting } = useMutation({
    mutationFn: () => engApi.delete(engId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engs'] })
      navigate(-1)
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  const { mutate: deleteEvent, isPending: isDeletingEvent, variables: deletingEventId } = useMutation({
    mutationFn: (eventId: number) => eventApi.delete(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eng', engId] })
      toast.success('Événement supprimé')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  const { mutate: accomplirEvent, isPending: isAccomplishing, variables: accomplishingEventId } = useMutation({
    mutationFn: (eventId: number) =>
      eventApi.update(eventId, { date_heure_reelle: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eng', engId] })
      toast.success('Événement marqué accompli')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })

  const handleEventMutated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['eng', engId] })
  }, [queryClient, engId])

  const { mutate: duplicate, isPending: isDuplicating } = useMutation({
    mutationFn: () => engApi.duplicate(engId),
    onSuccess: (res) => {
      const newId = (res.data as Eng).id
      queryClient.invalidateQueries({ queryKey: ['engs'] })
      toast.success('Engagement dupliqué')
      navigate(`/eng/${newId}`)
    },
    onError: () => toast.error('Erreur lors de la duplication'),
  })

  const { mutate: bulkAccomplir, isPending: isBulkAccomplishing } = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => eventApi.update(id, { date_heure_reelle: new Date().toISOString() })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eng', engId] })
      const count = selectedEventIds.size
      setSelectedEventIds(new Set())
      toast.success(`${count} événement(s) marqués accomplis`)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })

  const { mutateAsync: saveDesc, isPending: isSavingDesc } = useMutation({
    mutationFn: (description: string) => engApi.update(engId, { description }),
  })

  if (isLoading) return <div className="p-6 text-center text-gray-400 py-16">Chargement…</div>
  if (isError || !eng) return <div className="p-6 text-center text-red-500 py-16">Impossible de charger cet engagement.</div>

  const pct = eng.accomplissement ?? 0
  const now = new Date()
  const sortedEvents = [...(eng.events ?? [])].sort(
    (a, b) => new Date(a.date_heure_prevue).getTime() - new Date(b.date_heure_prevue).getTime(),
  )
  const overdueEvents = sortedEvents.filter(
    (e) => !e.est_accompli && new Date(e.date_heure_prevue) < now,
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

      {/* Alerte EVENTs en retard */}
      {overdueEvents.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            <strong>{overdueEvents.length}</strong> événement{overdueEvents.length > 1 ? 's' : ''} en retard dans cet engagement
          </span>
        </div>
      )}

      {/* ─── En-tête ──────────────────────────── */}
      <div className="mb-4">
        <div className="flex items-start gap-4">
          <EntityAvatar
            type="eng"
            nom={eng.obj.nom}
            image={eng.obj.images.find((i) => i.est_principale)}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight">{eng.obj.nom}</h1>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 shrink-0 mt-1">
                    {eng.teng.nom}
                  </span>
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex items-center gap-2 shrink-0">
                {(eng.gantt_mermaid || sortedEvents.length > 0) && (
                  <div className="flex items-center border border-violet-200 rounded-lg overflow-hidden">
                    {eng.gantt_mermaid && (
                      <button
                        onClick={() => setShowTimeline(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors"
                      >
                        <CalendarDays size={14} />
                        Timeline
                      </button>
                    )}
                    {sortedEvents.length > 0 && (
                      <button
                        onClick={() => setShowGantt(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors${eng.gantt_mermaid ? ' border-l border-violet-200' : ''}`}
                      >
                        <GanttChartSquare size={14} />
                        Gantt
                      </button>
                    )}
                  </div>
                )}
                {isEditeur() && (
                  <>
                    {showDeleteConfirm ? (
                      <>
                        <span className="text-sm text-red-600 font-medium">Supprimer ?</span>
                        <button
                          onClick={() => deleteEng()}
                          disabled={isDeleting}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          {isDeleting ? 'Suppression…' : 'Confirmer'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => duplicate()}
                          disabled={isDuplicating}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          title="Dupliquer cet engagement"
                        >
                          {isDuplicating ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                          Dupliquer
                        </button>
                        <button
                          onClick={() => navigate(`/eng/${engId}/edit`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Edit size={14} />
                          Modifier
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                          Supprimer
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Barre de progression */}
      <div className="mb-4">
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

      {/* ORGs et ENVs */}
      {(eng.orgs.length > 0 || eng.envs.length > 0) && (
        <div className="mb-6 flex flex-col gap-4">
          {eng.orgs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Organisations</p>
              <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-blue-50 text-left text-xs text-gray-500">
                    <th className="px-3 py-1.5 font-medium w-6"></th>
                    <th className="px-3 py-1.5 font-medium w-1/2">Nom</th>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...eng.orgs].sort((a, b) => {
                    const aPrinc = eng.org_principale?.id === a.id ? 0 : 1
                    const bPrinc = eng.org_principale?.id === b.id ? 0 : 1
                    if (aPrinc !== bPrinc) return aPrinc - bPrinc
                    return a.nom.localeCompare(b.nom)
                  }).map((org) => {
                    const isPrincipale = eng.org_principale?.id === org.id
                    return (
                      <tr key={org.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-3 py-1.5 text-amber-500 text-center">
                          {isPrincipale ? '★' : ''}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <Link to={`/org/${org.id}`} className="text-blue-700 hover:underline font-medium">
                            {org.nom}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{org.torg_nom ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {eng.envs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Environnements</p>
              <table className="w-full text-sm border border-gray-100 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-orange-50 text-left text-xs text-gray-500">
                    <th className="px-3 py-1.5 font-medium w-6"></th>
                    <th className="px-3 py-1.5 font-medium w-1/2">Nom</th>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...eng.envs].sort((a, b) => {
                    const aPrinc = eng.env_principale?.id === a.id ? 0 : 1
                    const bPrinc = eng.env_principale?.id === b.id ? 0 : 1
                    if (aPrinc !== bPrinc) return aPrinc - bPrinc
                    return a.nom.localeCompare(b.nom)
                  }).map((env) => {
                    const isPrincipal = eng.env_principale?.id === env.id
                    return (
                      <tr key={env.id} className="hover:bg-orange-50/40 transition-colors">
                        <td className="px-3 py-1.5 text-amber-500 text-center">
                          {isPrincipal ? '★' : ''}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <Link to={`/env/${env.id}`} className="text-orange-700 hover:underline font-medium">
                            {env.nom}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{env.tenv_nom ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Dates ────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Dates</h2>
        <DateGrid
          dateDebut={eng.date_debut}
          dateDebutPrevue={eng.date_debut_prevue}
          dateFin={eng.date_fin}
          dateFinPrevue={eng.date_fin_prevue}
        />
      </section>

      {/* ─── Description ──────────────────────── */}
      {(eng.obj.description || isEditeur()) && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Description</h2>
            {isEditeur() && !editingDesc && (
              <button
                onClick={() => { setDescDraft(eng.obj.description ?? ''); setEditingDesc(true) }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600 transition-colors"
              >
                <Pencil size={12} />
                Modifier
              </button>
            )}
          </div>
          {editingDesc ? (
            <div className="space-y-2">
              <textarea
                ref={descRef}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white font-mono resize-none min-h-[160px]"
                placeholder="Description en Markdown…"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingDesc(false)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X size={13} />
                  Annuler
                </button>
                <button
                  onClick={async () => { try { await saveDesc(descDraft); queryClient.invalidateQueries({ queryKey: ['eng', engId] }); setEditingDesc(false); toast.success('Description enregistrée') } catch { toast.error('Erreur lors de la sauvegarde') } }}
                  disabled={isSavingDesc}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {isSavingDesc ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Enregistrer
                </button>
              </div>
            </div>
          ) : eng.obj.description ? (
            <MarkdownContent>{eng.obj.description}</MarkdownContent>
          ) : (
            <button
              onClick={() => { setDescDraft(''); setEditingDesc(true) }}
              className="w-full py-6 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg hover:border-violet-300 hover:text-violet-500 transition-colors"
            >
              + Ajouter une description
            </button>
          )}
        </section>
      )}

      {/* ─── Propriétés ───────────────────────── */}
      {(() => {
        const claProps = eng.obj.cla.props ?? []
        const valueByPropId = new Map(eng.obj.values.map((v) => [v.prop.id, v]))
        const claPropsIds = new Set(claProps.map((p) => p.id))
        const inheritedValues = eng.obj.values.filter((v) => !claPropsIds.has(v.prop.id))
        if (claProps.length === 0 && inheritedValues.length === 0) return null
        return (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Propriétés ({claProps.length + inheritedValues.length})
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {claProps.map((prop) => (
                  <PropValueCard key={prop.id} prop={prop} value={valueByPropId.get(prop.id)} />
                ))}
                {inheritedValues.map((val) => (
                  <PropValueCard key={val.id} prop={val.prop} value={val} />
                ))}
              </div>
            </div>
          </section>
        )
      })()}

      {/* ─── Images ───────────────────────────── */}
      {eng.obj.images.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Images ({eng.obj.images.length})
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {eng.obj.images.map((img) => (
              <div key={img.id} className="relative">
                <SmartImage
                  src={imgUrl(img.chemin)}
                  alt={img.nom_original ?? ''}
                  className="w-full h-32 object-cover rounded-lg border border-gray-200"
                  cropWidth={300}
                  cropHeight={128}
                />
                {img.est_principale && (
                  <span className="absolute top-1.5 left-1.5 text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded font-medium">
                    Principale
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Documents ────────────────────────── */}
      {eng.obj.documents.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Documents ({eng.obj.documents.length})
          </h2>
          <div className="space-y-2">
            {eng.obj.documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={16} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-900 truncate">{doc.nom_original}</span>
                  <span className="text-xs text-gray-400 shrink-0 bg-gray-50 px-1.5 py-0.5 rounded">
                    {doc.format === 'markdown' ? 'Markdown' : 'Office'}
                  </span>
                </div>
                <a
                  href={`/api/media/files/${doc.chemin}`}
                  download={doc.nom_original}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 shrink-0 ml-3"
                >
                  <Download size={14} />
                  Télécharger
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Évènements ───────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Évènements ({sortedEvents.length})
          </h2>
          <div className="flex items-center gap-2">
            {/* Toggle vue */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setEventsView('list')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                  eventsView === 'list'
                    ? 'bg-violet-100 text-violet-700 font-medium'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <List size={13} />
                Liste
              </button>
              <button
                onClick={() => setEventsView('calendar')}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border-l border-gray-200 transition-colors ${
                  eventsView === 'calendar'
                    ? 'bg-violet-100 text-violet-700 font-medium'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                <CalendarDays size={13} />
                Calendrier
              </button>
            </div>
            {isEditeur() && (
              <button
                onClick={() => setShowCreateEvent(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
              >
                <Plus size={14} />
                Ajouter
              </button>
            )}
          </div>
        </div>

        {eventsView === 'calendar' ? (
          <CalendarView engId={engId} />
        ) : sortedEvents.length === 0 ? (
          <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-lg border border-gray-200">
            Aucun évènement
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {sortedEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  isEditeur={isEditeur()}
                  onEdit={() => setEditingEventId(event.id)}
                  onDelete={(id) => deleteEvent(id)}
                  onAccomplir={(id) => accomplirEvent(id)}
                  isDeleting={isDeletingEvent && deletingEventId === event.id}
                  isAccomplishing={isAccomplishing && accomplishingEventId === event.id}
                  selected={selectedEventIds.has(event.id)}
                  onToggleSelect={(id) => setSelectedEventIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id); else next.add(id)
                    return next
                  })}
                />
              ))}
            </div>

            {/* Barre d'actions groupées */}
            {selectedEventIds.size > 0 && (
              <div className="sticky bottom-4 z-10 mt-3 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl">
                <span className="text-sm font-medium">{selectedEventIds.size} sélectionné(s)</span>
                <button
                  onClick={() => bulkAccomplir([...selectedEventIds])}
                  disabled={isBulkAccomplishing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isBulkAccomplishing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Marquer accomplis
                </button>
                <button
                  onClick={() => setSelectedEventIds(new Set())}
                  className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  <X size={14} />
                  Annuler
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ─── Journal ──────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Journal des modifications</h2>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
          <LogTimeline tableName="eng" entiteId={engId} />
        </div>
      </section>

      {/* ─── Modales ──────────────────────────── */}
      <EventCreateModal
        open={showCreateEvent}
        onClose={() => setShowCreateEvent(false)}
        engId={engId}
        onCreated={handleEventMutated}
      />

      <EventEditModal
        open={editingEventId !== null}
        onClose={() => setEditingEventId(null)}
        eventId={editingEventId}
        onUpdated={handleEventMutated}
      />

      {eng.gantt_mermaid && (
        <MermaidModal
          open={showTimeline}
          onClose={() => setShowTimeline(false)}
          id={`tl-${engId}`}
          code={eng.gantt_mermaid}
          title="Timeline"
          stripInit
        />
      )}

      <GanttModal
        open={showGantt}
        onClose={() => setShowGantt(false)}
        eng={eng}
      />
    </div>
  )
}
