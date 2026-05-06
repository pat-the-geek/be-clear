import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2, X, Lightbulb } from 'lucide-react'
import { eventApi, teventApi, engApi, claApi } from '@/services/api'
import { useAutoResize } from '@/hooks/useAutoResize'
import { toast } from '@/lib/toast'
import type { Tevent, PaginatedResponse, Prop } from '@/types'
import ValueField, { type ValueDraft, emptyDraft } from '@/components/shared/ValueField'

interface EngBriefItem {
  id: number
  nom: string
}

function isoToDatetimeLocal(iso?: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function datetimeLocalToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

export default function EventCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const preselectedEngId = searchParams.get('eng') ? Number(searchParams.get('eng')) : null

  const [nom, setNom] = useState('')
  const [teventId, setTeventId] = useState<number | null>(null)
  const [engId, setEngId] = useState<number | null>(preselectedEngId)
  const [dateHeurePrevue, setDateHeurePrevue] = useState('')
  const [dateHeureReelle, setDateHeureReelle] = useState('')
  const [description, setDescription] = useState('')
  const descRef = useAutoResize(description)
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())
  const [claId, setClaId] = useState<number | null>(null)

  const { data: tevents } = useQuery({
    queryKey: ['tevents'],
    queryFn: () => teventApi.list().then((r) => r.data as Tevent[]),
  })

  const { data: engList } = useQuery({
    queryKey: ['engs', 'brief-create'],
    queryFn: () => engApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<EngBriefItem>).items),
  })

  const { data: claProps = [], isLoading: propsLoading } = useQuery({
    queryKey: ['cla-props-all', claId],
    queryFn: () => claApi.propsAll(claId!).then((r) => r.data as Prop[]),
    enabled: !!claId,
  })

  const { data: suggest, isFetching: isSuggesting } = useQuery({
    queryKey: ['event', 'suggest', engId],
    queryFn: () => eventApi.suggest(engId!).then((r) => r.data as { date_heure_prevue_suggere: string }),
    enabled: !!engId,
  })

  useEffect(() => {
    if (!teventId || !tevents) {
      setClaId(null)
      setDrafts(new Map())
      return
    }
    const t = tevents.find((t) => t.id === teventId)
    if (t?.cla?.id) setClaId(t.cla.id)
  }, [teventId, tevents])

  useEffect(() => {
    setDrafts(new Map(claProps.map((p) => [p.id, emptyDraft(p.id)])))
  }, [claProps])

  useEffect(() => {
    if (suggest?.date_heure_prevue_suggere && !dateHeurePrevue) {
      setDateHeurePrevue(isoToDatetimeLocal(suggest.date_heure_prevue_suggere))
    }
  }, [suggest])

  const { mutateAsync: createAsync, isPending, isSuccess, error } = useMutation({
    mutationFn: () =>
      eventApi.create({
        nom: nom.trim(),
        tevent_id: teventId!,
        eng_id: engId!,
        date_heure_prevue: datetimeLocalToIso(dateHeurePrevue),
        date_heure_reelle: dateHeureReelle ? datetimeLocalToIso(dateHeureReelle) : null,
        description: description || undefined,
        values: Array.from(drafts.values()),
      }),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPending || isSuccess) return
    try {
      const res = await createAsync()
      toast.success('Évènement créé')
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['eng', engId] })
      navigate(`/event/${res.data.id}`)
    } catch {
      toast.error('Erreur lors de la création')
    }
  }

  const applyDateSuggestion = () => {
    if (suggest?.date_heure_prevue_suggere) {
      setDateHeurePrevue(isoToDatetimeLocal(suggest.date_heure_prevue_suggere))
    }
  }

  const updateDraft = (updated: ValueDraft) => {
    setDrafts((prev) => new Map(prev).set(updated.prop_id, updated))
  }

  const rawDetail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  const apiError: string | null = !rawDetail
    ? null
    : typeof rawDetail === 'string'
    ? rawDetail
    : Array.isArray(rawDetail)
    ? (rawDetail as { msg?: string }[]).map((e) => e.msg ?? JSON.stringify(e)).join(' · ')
    : JSON.stringify(rawDetail)

  const canSubmit = !!nom.trim() && !!teventId && !!engId && !!dateHeurePrevue && !isPending && !isSuccess

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/events')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouvel évènement</h1>
          <p className="text-sm text-gray-400">Créer un évènement</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Identité ───────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Identité</h2>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              className={inputClass}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom de l'évènement"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Type d'évènement <span className="text-red-500">*</span>
            </label>
            <select
              required
              className={inputClass}
              value={teventId ?? ''}
              onChange={(e) => setTeventId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Choisir un type —</option>
              {(tevents ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nom}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Engagement parent <span className="text-red-500">*</span>
            </label>
            <select
              required
              className={inputClass}
              value={engId ?? ''}
              onChange={(e) => {
                setEngId(e.target.value ? Number(e.target.value) : null)
                setDateHeurePrevue('')
              }}
            >
              <option value="">— Choisir un engagement —</option>
              {(engList ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.nom}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ── Dates ──────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Dates</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Date prévue <span className="text-red-500">*</span>
                </label>
                {engId && suggest?.date_heure_prevue_suggere && (
                  <button
                    type="button"
                    onClick={applyDateSuggestion}
                    disabled={isSuggesting}
                    className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 transition-colors"
                    title="Appliquer la date suggérée"
                  >
                    {isSuggesting ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <Lightbulb size={10} />
                    )}
                    Suggérée
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                required
                className={inputClass}
                value={dateHeurePrevue}
                onChange={(e) => setDateHeurePrevue(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Date réelle
                <span className="ml-1 text-[10px] text-gray-400 normal-case font-normal">(accompli si renseignée)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  value={dateHeureReelle}
                  onChange={(e) => setDateHeureReelle(e.target.value)}
                />
                {dateHeureReelle && (
                  <button
                    type="button"
                    onClick={() => setDateHeureReelle('')}
                    className="px-2 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    title="Effacer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Description ────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Description</h2>
          <textarea
            ref={descRef}
            className={`${inputClass} font-mono resize-none min-h-[120px]`}
            placeholder="Description en Markdown…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-[11px] text-gray-400">Syntaxe Markdown supportée</p>
        </section>

        {/* ── Propriétés ─────────────────────────────────── */}
        {teventId && propsLoading && (
          <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Chargement des propriétés…</span>
          </div>
        )}

        {claProps.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Propriétés ({claProps.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {claProps.map((prop) => (
                <ValueField
                  key={prop.id}
                  propId={prop.id}
                  propNom={prop.nom}
                  propType={prop.type}
                  valeursList={prop.valeurs_liste}
                  draft={drafts.get(prop.id) ?? emptyDraft(prop.id)}
                  onChange={updateDraft}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Erreur ─────────────────────────────────────── */}
        {apiError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {apiError}
          </div>
        )}

        {/* ── Actions ────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/events')}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Créer
          </button>
        </div>
      </form>
    </div>
  )
}
