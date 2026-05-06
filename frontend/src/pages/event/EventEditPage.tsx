/**
 * EventEditPage — formulaire d'édition d'un EVENT
 *
 * Permet de modifier :
 *  • Nom (obj.nom)
 *  • Type (tevent_id)
 *  • Date prévue (date_heure_prevue)
 *  • Date réelle (date_heure_reelle — marque l'EVENT comme accompli)
 *  • Description (obj.description — Markdown)
 *  • Toutes les propriétés (values via ValueField)
 *  • Images
 *  • Documents
 */
import { useState, useEffect } from 'react'
import { useAutoResize } from '@/hooks/useAutoResize'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { eventApi, teventApi } from '@/services/api'
import { toast } from '@/lib/toast'
import type { Event, Tevent } from '@/types'
import ValueField, { type ValueDraft, emptyDraft } from '@/components/shared/ValueField'
import ImageManager from '@/components/shared/ImageManager'
import DocManager from '@/components/shared/DocManager'

// ─── Helpers ──────────────────────────────────────────────────

function isoToDatetimeLocal(iso?: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function datetimeLocalToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

function buildDrafts(event: Event): Map<number, ValueDraft> {
  const map = new Map<number, ValueDraft>()
  for (const val of event.obj.values) {
    const pid = val.prop.id
    map.set(pid, {
      prop_id: pid,
      valeur_texte: val.valeur_texte ?? null,
      valeur_date: val.valeur_date ?? null,
      valeur_nombre: val.valeur_nombre ?? null,
      valeur_bool: val.valeur_bool ?? null,
      valeur_json: val.valeur_json ?? null,
      valeur_ref_obj_id: val.valeur_ref_obj_id ?? null,
    })
  }
  return map
}

// ─── Page ─────────────────────────────────────────────────────

export default function EventEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const eventId = Number(id)

  // ── Chargement des données ────────────────────────────────
  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => eventApi.get(eventId).then((r) => r.data as Event),
    enabled: !isNaN(eventId),
  })

  const { data: tevents } = useQuery({
    queryKey: ['tevents'],
    queryFn: () => teventApi.list().then((r) => r.data as Tevent[]),
  })

  // ── État du formulaire ────────────────────────────────────
  const [nom, setNom] = useState('')
  const [teventId, setTeventId] = useState<number | null>(null)
  const [dateHeurePrevue, setDateHeurePrevue] = useState('')
  const [dateHeureReelle, setDateHeureReelle] = useState('')
  const [description, setDescription] = useState('')
  const descRef = useAutoResize(description)
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())

  useEffect(() => {
    if (!event) return
    setNom(event.obj.nom)
    setTeventId(event.tevent.id)
    setDateHeurePrevue(isoToDatetimeLocal(event.date_heure_prevue))
    setDateHeureReelle(isoToDatetimeLocal(event.date_heure_reelle))
    setDescription(event.obj.description ?? '')
    const newDrafts = buildDrafts(event)
    for (const prop of event.obj.cla.props ?? []) {
      if (!newDrafts.has(prop.id)) {
        newDrafts.set(prop.id, emptyDraft(prop.id))
      }
    }
    setDrafts(newDrafts)
  }, [event])

  // ── Mutation ──────────────────────────────────────────────
  const { mutate: save, isPending, error } = useMutation({
    mutationFn: () => {
      const values = Array.from(drafts.values())
      return eventApi.update(eventId, {
        nom: nom.trim() || undefined,
        tevent_id: teventId ?? undefined,
        description: description || undefined,
        date_heure_prevue: dateHeurePrevue ? datetimeLocalToIso(dateHeurePrevue) : undefined,
        date_heure_reelle: dateHeureReelle ? datetimeLocalToIso(dateHeureReelle) : null,
        values,
      })
    },
    onSuccess: () => {
      toast.success('Évènement mis à jour')
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      navigate(`/event/${eventId}`)
    },
    onError: () => {
      toast.error('Échec de la mise à jour')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    save()
  }

  const updateDraft = (updated: ValueDraft) => {
    setDrafts((prev) => new Map(prev).set(updated.prop_id, updated))
  }

  // ── Rendu ─────────────────────────────────────────────────
  if (eventLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" />
        <span>Chargement…</span>
      </div>
    )
  }
  if (!event) {
    return <p className="p-6 text-red-500">Évènement introuvable.</p>
  }

  const claPropsSet = new Set((event.obj.cla.props ?? []).map((p) => p.id))
  const propsToDisplay = [
    ...(event.obj.cla.props ?? []).map((p) => ({
      prop: p,
      draft: drafts.get(p.id) ?? emptyDraft(p.id),
    })),
    ...event.obj.values
      .filter((v) => !claPropsSet.has(v.prop.id))
      .map((v) => ({ prop: v.prop, draft: drafts.get(v.prop.id) ?? emptyDraft(v.prop.id) })),
  ]

  const rawDetail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  const apiError: string | null = !rawDetail
    ? null
    : typeof rawDetail === 'string'
    ? rawDetail
    : Array.isArray(rawDetail)
    ? (rawDetail as { msg?: string }[]).map((e) => e.msg ?? JSON.stringify(e)).join(' · ')
    : JSON.stringify(rawDetail)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modifier l'évènement</h1>
          <p className="text-sm text-gray-400">{event.obj.nom}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Identité ───────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Identité</h2>

          {/* Nom */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </div>

          {/* Type TEVENT */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Type d'évènement
            </label>
            <select
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-white"
              value={teventId ?? ''}
              onChange={(e) => setTeventId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Choisir un type —</option>
              {(tevents ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nom}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ── Dates ──────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Dates</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date prévue */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Date prévue <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                required
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                value={dateHeurePrevue}
                onChange={(e) => setDateHeurePrevue(e.target.value)}
              />
            </div>

            {/* Date réelle */}
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
                    ✕
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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono resize-none min-h-[120px]"
            placeholder="Description en Markdown…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-[11px] text-gray-400">Syntaxe Markdown supportée</p>
        </section>

        {/* ── Propriétés ─────────────────────────────────── */}
        {propsToDisplay.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Propriétés ({propsToDisplay.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {propsToDisplay.map(({ prop, draft }) => (
                <ValueField
                  key={prop.id}
                  propId={prop.id}
                  propNom={prop.nom}
                  propType={prop.type}
                  valeursList={prop.valeurs_liste}
                  draft={draft}
                  onChange={updateDraft}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Images ─────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Images ({event.obj.images.length})
          </h2>
          <ImageManager
            objId={event.obj.id}
            images={event.obj.images}
            queryKey={['event', eventId]}
          />
        </section>

        {/* ── Documents ──────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Documents ({event.obj.documents.length})
          </h2>
          <DocManager
            objId={event.obj.id}
            documents={event.obj.documents}
            queryKey={['event', eventId]}
          />
        </section>

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
            onClick={() => navigate(`/event/${eventId}`)}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending || !nom.trim() || !dateHeurePrevue}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
