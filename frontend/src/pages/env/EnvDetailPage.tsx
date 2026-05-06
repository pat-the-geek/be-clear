import { useState, useEffect, useRef, useMemo } from 'react'
import { useAutoResize } from '@/hooks/useAutoResize'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import mermaid from 'mermaid'
import { ArrowLeft, Edit, CalendarDays, RefreshCw, Hash, Trash2, FileOutput, ChevronDown, X, Plus, Pencil, CheckCircle2, Loader2, CalendarClock, List } from 'lucide-react'
import { envApi, engApi, rptApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, formatDateTime } from '@/lib/utils'
import EntityAvatar from '@/components/shared/EntityAvatar'
import UrlValueDisplay from '@/components/shared/UrlValueDisplay'
import EngTable from '@/components/shared/EngTable'
import CreateEngModal from '@/components/shared/CreateEngModal'
import CalendarView from '@/components/shared/CalendarView'
import EventsInlineList from '@/components/shared/EventsInlineList'
import ImageManager from '@/components/shared/ImageManager'
import DocManager from '@/components/shared/DocManager'
import MarkdownContent from '@/components/shared/MarkdownContent'
import type { Env, Prop, Value, EngBrief, PaginatedResponse } from '@/types'

// ─── Composant : carte PROP / VALUE ─────────────────────────

function PropValueCard({ prop, value, onApplyDescription }: {
  prop: Prop
  value?: Value
  onApplyDescription?: (text: string) => void
}) {
  const type = prop.type
  let display: React.ReactNode = <span className="text-gray-400">—</span>

  if (value) {
    if (type === 'DATE' && value.valeur_date) {
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
      display = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value.valeur_nombre)
    } else if (type === 'POURCENTAGE' && value.valeur_nombre != null) {
      display = `${value.valeur_nombre} %`
    } else if (value.valeur_nombre != null) {
      display = String(value.valeur_nombre)
    } else if (type === 'MARKDOWN' && value.valeur_texte) {
      display = <MarkdownContent>{value.valeur_texte}</MarkdownContent>
    } else if (type === 'URL' && value.valeur_texte) {
      display = <UrlValueDisplay url={value.valeur_texte} onApplyDescription={onApplyDescription} />
    } else if (type === 'EMAIL' && value.valeur_texte) {
      display = <a href={`mailto:${value.valeur_texte}`} className="text-blue-600 hover:underline">{value.valeur_texte}</a>
    } else if (value.valeur_texte) {
      display = value.valeur_texte
    }
  }

  // Les types longs occupent les 2 colonnes
  const isWide = type === 'MARKDOWN' || type === 'TEXTE'

  return (
    <div className={`flex flex-col gap-1 ${isWide ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{prop.nom}</span>
      <div className="text-sm text-gray-900">{display}</div>
    </div>
  )
}

// ─── Timeline ENGs ────────────────────────────────────────────

function sanitizeLabel(s: string): string {
  return s.replace(/:/g, ' -').replace(/\n/g, ' ').trim()
}

function buildTimelineCode(engs: EngBrief[], envNom: string): string {
  const sorted = [...engs].sort((a, b) => {
    const da = a.date_debut_prevue || a.date_debut || '9999'
    const db = b.date_debut_prevue || b.date_debut || '9999'
    return da.localeCompare(db)
  })

  const byYear = new Map<string, Map<string, EngBrief[]>>()
  const unplanned: EngBrief[] = []

  for (const eng of sorted) {
    const dateStr = eng.date_debut_prevue || eng.date_debut
    if (!dateStr) { unplanned.push(eng); continue }
    const d = new Date(dateStr)
    const year = String(d.getFullYear())
    const month = d.toLocaleDateString('fr-FR', { month: 'long' })
    if (!byYear.has(year)) byYear.set(year, new Map())
    const byMonth = byYear.get(year)!
    if (!byMonth.has(month)) byMonth.set(month, [])
    byMonth.get(month)!.push(eng)
  }

  const lines: string[] = ['timeline', `    title Engagements — ${sanitizeLabel(envNom)}`]

  for (const [year, byMonth] of byYear) {
    lines.push(`    section ${year}`)
    for (const [month, group] of byMonth) {
      const label = month.charAt(0).toUpperCase() + month.slice(1)
      let first = true
      for (const eng of group) {
        const pct = eng.accomplissement !== undefined ? ` (${Math.round(eng.accomplissement)}%)` : ''
        const name = sanitizeLabel(eng.nom) + pct
        if (first) { lines.push(`        ${label} : ${name}`); first = false }
        else        { lines.push(`                : ${name}`) }
      }
    }
  }

  if (unplanned.length > 0) {
    lines.push('    section Non planifié')
    let first = true
    for (const eng of unplanned) {
      const name = sanitizeLabel(eng.nom)
      if (first) { lines.push(`        ? : ${name}`); first = false }
      else        { lines.push(`            : ${name}`) }
    }
  }

  return lines.join('\n')
}

function TimelineDiagram({ envId, envNom }: { envId: number; envNom: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fsContainerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { data: engs } = useQuery({
    queryKey: ['engs', 'timeline', envId],
    queryFn: async () => {
      const res = await engApi.list({ env_id: envId, page: 1, per_page: 500, sort_by: 'date_debut_prevue', sort_dir: 'asc' })
      return (res.data as PaginatedResponse<EngBrief>).items
    },
  })

  const timelineCode = useMemo(() => {
    if (!engs || engs.length === 0) return null
    return buildTimelineCode(engs, envNom)
  }, [engs, envNom])

  useEffect(() => {
    if (!timelineCode || !containerRef.current) return
    let cancelled = false
    const id = `timeline-env-${envId}`
    document.getElementById(`d${id}`)?.remove()
    mermaid.initialize({ startOnLoad: false })
    mermaid.render(id, timelineCode)
      .then(({ svg }) => {
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
          }
        }
      })
      .catch(() => {
        if (!cancelled && containerRef.current)
          containerRef.current.innerHTML = '<p class="text-xs text-red-400 p-2">Erreur de rendu du diagramme.</p>'
      })
    return () => { cancelled = true }
  }, [timelineCode, envId])

  useEffect(() => {
    if (!isFullscreen || !timelineCode || !fsContainerRef.current) return
    let cancelled = false
    const id = `timeline-env-fs-${envId}`
    document.getElementById(`d${id}`)?.remove()
    mermaid.render(id, timelineCode)
      .then(({ svg }) => {
        if (!cancelled && fsContainerRef.current) {
          fsContainerRef.current.innerHTML = svg
          const svgEl = fsContainerRef.current.querySelector('svg')
          if (svgEl) {
            const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
            style.textContent = 'line, polyline { stroke: #1e293b !important; stroke-width: 2px !important; }'
            svgEl.appendChild(style)
            svgEl.removeAttribute('width')
            svgEl.removeAttribute('height')
            svgEl.style.width = '100%'
            svgEl.style.height = 'auto'
          }
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isFullscreen, timelineCode, envId])

  useEffect(() => {
    if (!isFullscreen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  if (!engs) return <div className="text-gray-400 text-sm text-center py-4">Chargement…</div>
  if (!timelineCode) return null

  return (
    <>
      <div
        ref={containerRef}
        className="overflow-x-auto overflow-y-hidden max-h-64 rounded-xl border border-gray-200 bg-white p-4 cursor-zoom-in"
        onClick={() => setIsFullscreen(true)}
        title="Cliquer pour agrandir"
      />
      {isFullscreen && createPortal(
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-auto"
          onClick={() => setIsFullscreen(false)}
        >
          <div
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-[96vw] my-4 p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
            <div ref={fsContainerRef} className="overflow-x-auto" />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ─── Composant : section titre ───────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function EnvDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditeur = useAuthStore((s) => s.isEditeur)

  const envId = Number(id)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [eventsView, setEventsView] = useState<'list' | 'calendar'>('list')
  const [showRptMenu, setShowRptMenu] = useState(false)
  const [rptResult, setRptResult] = useState<{ chemin: string; nom_fichier: string } | null>(null)
  const [showCreateEng, setShowCreateEng] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const descRef = useAutoResize(descDraft)

  const { data: env, isLoading, isError } = useQuery({
    queryKey: ['env', envId],
    queryFn: () => envApi.get(envId).then((r) => r.data as Env),
    enabled: !isNaN(envId),
  })

  const { mutate: applyDescription } = useMutation({
    mutationFn: (description: string) =>
      envApi.update(envId, { description }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['env', envId] }),
  })

  const { mutate: saveDesc, isPending: isSavingDesc } = useMutation({
    mutationFn: (description: string) => envApi.update(envId, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env', envId] })
      setEditingDesc(false)
    },
  })

  const { mutate: generateRpt, isPending: isGeneratingRpt } = useMutation({
    mutationFn: async (destination: 'filesystem' | 'obsidian' | 'download') => {
      if (destination === 'download') {
        const res = await rptApi.downloadEnv(envId)
        const blob = new Blob([res.data], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const cd = res.headers['content-disposition'] ?? ''
        const match = cd.match(/filename="?([^"]+)"?/)
        a.download = match ? match[1] : `rapport_env_${envId}.md`
        a.href = url
        a.click()
        URL.revokeObjectURL(url)
        return null
      }
      return rptApi.env(envId, destination).then(r => r.data)
    },
    onSuccess: (data) => { if (data) setRptResult(data); setShowRptMenu(false) },
  })

  const { mutateAsync: deleteEnv, isPending: isDeleting } = useMutation({
    mutationFn: () => envApi.delete(envId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envs'] })
      window.location.href = '/env'
    },
  })

  if (isLoading) return <div className="p-6 text-center text-gray-400 py-16">Chargement…</div>
  if (isError || !env) return <div className="p-6 text-center text-red-500 py-16">Impossible de charger cet environnement.</div>

  const imagePrincipale = env.obj.images.find((i) => i.est_principale)

  // Fusion props CLA + values
  const valueByPropId = new Map(env.obj.values.map((v) => [v.prop.id, v]))
  const claProps = env.obj.cla.props ?? []
  const claPropsIds = new Set(claProps.map((p) => p.id))
  const inheritedValues = env.obj.values.filter((v) => !claPropsIds.has(v.prop.id))

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* ─── Bouton retour ────────────────────────────────── */}
      <div className="mb-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      {/* ─── En-tête ──────────────────────────────────────── */}
      <div className="flex items-start gap-5 mb-8">
        <EntityAvatar type="env" nom={env.obj.nom} image={imagePrincipale} size="lg" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{env.obj.nom}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                  {env.tenv.nom}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Bouton RPT */}
              <div className="relative">
                <button
                  onClick={() => setShowRptMenu((v) => !v)}
                  disabled={isGeneratingRpt}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  title="Générer un rapport"
                >
                  <FileOutput size={14} />
                  Rapport
                  <ChevronDown size={12} />
                </button>
                {showRptMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    <button
                      onClick={() => generateRpt('download')}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Dossier local
                    </button>
                    <button
                      onClick={() => generateRpt('obsidian')}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
                    >
                      Vault Obsidian
                    </button>
                  </div>
                )}
              </div>

              {isEditeur() && (
                <>
                  {showDeleteConfirm ? (
                    <>
                      <span className="text-sm text-red-600 font-medium">Supprimer définitivement ?</span>
                      <button
                        onClick={() => deleteEnv()}
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
                        onClick={() => navigate(`/env/${envId}/edit`)}
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

      {/* ─── Confirmation RPT ─────────────────────────────── */}
      {rptResult && (
        <div className="mb-6 flex items-start justify-between gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div>
            <p className="text-sm font-medium text-green-800">Rapport généré avec succès</p>
            <p className="text-xs text-green-700 mt-0.5 font-mono break-all">{rptResult.chemin}</p>
          </div>
          <button onClick={() => setRptResult(null)} className="text-green-600 hover:text-green-800 text-xs shrink-0">✕</button>
        </div>
      )}

      {/* ─── Description ──────────────────────────────────── */}
      {(env.obj.description || isEditeur()) && (
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Description</h2>
            {isEditeur() && !editingDesc && (
              <button
                onClick={() => { setDescDraft(env.obj.description ?? ''); setEditingDesc(true) }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-orange-500 transition-colors"
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
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white font-mono resize-none min-h-[160px]"
                placeholder="Description en Markdown…"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setEditingDesc(false); setDescDraft('') }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X size={13} />
                  Annuler
                </button>
                <button
                  onClick={() => saveDesc(descDraft)}
                  disabled={isSavingDesc}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {isSavingDesc ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Enregistrer
                </button>
              </div>
            </div>
          ) : env.obj.description ? (
            <MarkdownContent>{env.obj.description}</MarkdownContent>
          ) : (
            <button
              onClick={() => { setDescDraft(''); setEditingDesc(true) }}
              className="w-full py-6 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg hover:border-orange-300 hover:text-orange-500 transition-colors"
            >
              + Ajouter une description
            </button>
          )}
        </section>
      )}

      {/* ─── Propriétés ───────────────────────────────────── */}
      {(claProps.length > 0 || inheritedValues.length > 0) && (
        <section className="mb-7">
          <SectionTitle>Propriétés ({claProps.length + inheritedValues.length})</SectionTitle>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {claProps.map((prop) => (
                <PropValueCard
                  key={prop.id}
                  prop={prop}
                  value={valueByPropId.get(prop.id)}
                  onApplyDescription={isEditeur() ? applyDescription : undefined}
                />
              ))}
              {inheritedValues.map((val) => (
                <PropValueCard
                  key={val.id}
                  prop={val.prop}
                  value={val}
                  onApplyDescription={isEditeur() ? applyDescription : undefined}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Images ───────────────────────────────────────── */}
      {(env.obj.images.length > 0 || isEditeur()) && (
        <section className="mb-7">
          <SectionTitle>Images ({env.obj.images.length})</SectionTitle>
          <ImageManager
            objId={env.obj.id}
            images={env.obj.images}
            queryKey={['env', envId]}
            readOnly={!isEditeur()}
          />
        </section>
      )}

      {/* ─── Timeline Engagements ─────────────────────────── */}
      <section className="mb-4">
        <SectionTitle>Timeline des engagements</SectionTitle>
        <TimelineDiagram envId={envId} envNom={env.obj.nom} />
      </section>

      {/* ─── Table Engagements ────────────────────────────── */}
      <section className="mb-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Engagements</h2>
          {isEditeur() && (
            <button
              onClick={() => setShowCreateEng(true)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
              title="Nouvel engagement"
            >
              <Plus size={14} />
              Nouveau
            </button>
          )}
        </div>
        <EngTable envId={envId} />
      </section>

      {/* ─── Événements ───────────────────────────────────── */}
      <section className="mb-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Événements</h2>
          <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-lg">
            <button
              onClick={() => setEventsView('list')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${eventsView === 'list' ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List size={12} />
              Liste
            </button>
            <button
              onClick={() => setEventsView('calendar')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${eventsView === 'calendar' ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <CalendarClock size={12} />
              Calendrier
            </button>
          </div>
        </div>
        {eventsView === 'calendar' ? (
          <CalendarView envId={envId} />
        ) : (
          <EventsInlineList envId={envId} />
        )}
      </section>

      <CreateEngModal
        open={showCreateEng}
        onClose={() => setShowCreateEng(false)}
        envId={envId}
        entityNom={env.obj.nom}
      />

      {/* ─── Documents ────────────────────────────────────── */}
      {(env.obj.documents.length > 0 || isEditeur()) && (
        <section className="mb-7">
          <SectionTitle>Documents ({env.obj.documents.length})</SectionTitle>
          <DocManager
            objId={env.obj.id}
            documents={env.obj.documents}
            queryKey={['env', envId]}
            readOnly={!isEditeur()}
          />
        </section>
      )}

      {/* ─── Métadonnées OBJ ──────────────────────────────── */}
      <section className="mt-8 pt-6 border-t border-gray-100">
        <SectionTitle>Informations système</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
            <CalendarDays size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Créé le</p>
              <p className="text-sm text-gray-700">{formatDateTime(env.obj.created_at)}</p>
              {env.obj.created_by && (
                <p className="text-xs text-gray-500 mt-0.5">par <span className="font-medium">{env.obj.created_by.nom}</span></p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
            <RefreshCw size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Modifié le</p>
              <p className="text-sm text-gray-700">{formatDateTime(env.obj.updated_at)}</p>
              {env.obj.updated_by && (
                <p className="text-xs text-gray-500 mt-0.5">par <span className="font-medium">{env.obj.updated_by.nom}</span></p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg col-span-2">
            <Hash size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Identifiant unique (UID)</p>
              <p className="text-xs font-mono text-gray-500 break-all">{env.obj.uid}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
