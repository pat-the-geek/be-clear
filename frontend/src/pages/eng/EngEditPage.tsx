/**
 * EngEditPage — formulaire d'édition d'un ENG
 *
 * Permet de modifier :
 *  • Nom (obj.nom)
 *  • Type (teng_id)
 *  • Description (obj.description — Markdown)
 *  • ORGs et ENVs associées (multi-sélection)
 *  • Dates (début réel, début prévu, fin réelle — fin prévue calculée, lecture seule)
 *  • Propriétés (values via ValueField)
 *  • Images
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { engApi, tengApi, orgApi, envApi } from '@/services/api'
import type { Eng, Teng, OrgBrief, EnvBrief } from '@/types'
import ValueField, { type ValueDraft, emptyDraft } from '@/components/shared/ValueField'
import ImageManager from '@/components/shared/ImageManager'
import DocManager from '@/components/shared/DocManager'

// ─── Helpers ──────────────────────────────────────────────────

function buildDrafts(eng: Eng): Map<number, ValueDraft> {
  const map = new Map<number, ValueDraft>()
  for (const val of eng.obj.values) {
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

function isoToDateInput(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function dateInputToIso(val: string): string | undefined {
  return val ? `${val}T00:00:00` : undefined
}

// ─── Page ─────────────────────────────────────────────────────

export default function EngEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const engId = Number(id)

  const { data: eng, isLoading } = useQuery({
    queryKey: ['eng', engId],
    queryFn: () => engApi.get(engId).then((r) => r.data as Eng),
    enabled: !isNaN(engId),
  })

  const { data: tengList } = useQuery({
    queryKey: ['teng', 'list'],
    queryFn: () => tengApi.list().then((r) => r.data as Teng[]),
  })

  const { data: orgList } = useQuery({
    queryKey: ['orgs', 'all'],
    queryFn: () => orgApi.list({ per_page: 200 }).then((r) => r.data.items as OrgBrief[]),
  })

  const { data: envList } = useQuery({
    queryKey: ['envs', 'all'],
    queryFn: () => envApi.list({ per_page: 200 }).then((r) => r.data.items as EnvBrief[]),
  })

  // ── État du formulaire ────────────────────────────────────
  const [nom, setNom] = useState('')
  const [tengId, setTengId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<number>>(new Set())
  const [selectedEnvIds, setSelectedEnvIds] = useState<Set<number>>(new Set())
  const [dateDebut, setDateDebut] = useState('')
  const [dateDebutPrevue, setDateDebutPrevue] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())

  useEffect(() => {
    if (!eng) return
    setNom(eng.obj.nom)
    setTengId(eng.teng.id)
    setDescription(eng.obj.description ?? '')
    setSelectedOrgIds(new Set(eng.orgs.map((o) => o.id)))
    setSelectedEnvIds(new Set(eng.envs.map((e) => e.id)))
    setDateDebut(isoToDateInput(eng.date_debut))
    setDateDebutPrevue(isoToDateInput(eng.date_debut_prevue))
    setDateFin(isoToDateInput(eng.date_fin))
    const newDrafts = buildDrafts(eng)
    for (const prop of eng.obj.cla.props ?? []) {
      if (!newDrafts.has(prop.id)) newDrafts.set(prop.id, emptyDraft(prop.id))
    }
    setDrafts(newDrafts)
  }, [eng])

  // ── Mutation ──────────────────────────────────────────────
  const { mutate: save, isPending, error } = useMutation({
    mutationFn: () =>
      engApi.update(engId, {
        nom: nom.trim() || undefined,
        teng_id: tengId ?? undefined,
        description: description || undefined,
        org_ids: [...selectedOrgIds],
        env_ids: [...selectedEnvIds],
        date_debut: dateInputToIso(dateDebut),
        date_debut_prevue: dateInputToIso(dateDebutPrevue),
        date_fin: dateInputToIso(dateFin),
        values: Array.from(drafts.values()),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eng', engId] })
      navigate(`/eng/${engId}`)
    },
  })

  const updateDraft = (updated: ValueDraft) => {
    setDrafts((prev) => new Map(prev).set(updated.prop_id, updated))
  }

  const toggleOrg = (id: number) => {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleEnv = (id: number) => {
    setSelectedEnvIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Rendu ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" />
        <span>Chargement…</span>
      </div>
    )
  }
  if (!eng) return <p className="p-6 text-red-500">Engagement introuvable.</p>

  const claPropsSet = new Set((eng.obj.cla.props ?? []).map((p) => p.id))
  const propsToDisplay = [
    ...(eng.obj.cla.props ?? []).map((p) => ({
      prop: p,
      draft: drafts.get(p.id) ?? emptyDraft(p.id),
    })),
    ...eng.obj.values
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

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate(`/eng/${engId}`)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modifier l'engagement</h1>
          <p className="text-sm text-gray-400">{eng.obj.nom}</p>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); save() }} className="space-y-6">

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
              className={inputClass}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Type d'engagement
            </label>
            <select
              className={inputClass}
              value={tengId ?? ''}
              onChange={(e) => setTengId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Choisir un type —</option>
              {(tengList ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.nom}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ── Description ────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Description</h2>
          <textarea
            rows={5}
            className={`${inputClass} font-mono resize-y`}
            placeholder="Description en Markdown…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-[11px] text-gray-400">Syntaxe Markdown supportée</p>
        </section>

        {/* ── Organisations liées ─────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Organisations</h2>
            <span className="text-xs text-gray-400">{selectedOrgIds.size} sélectionnée(s)</span>
          </div>
          {orgList && orgList.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
              {orgList.map((org) => (
                <label
                  key={org.id}
                  className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedOrgIds.has(org.id)}
                    onChange={() => toggleOrg(org.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 truncate">{org.nom}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucune organisation disponible</p>
          )}
        </section>

        {/* ── Environnements liés ─────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Environnements</h2>
            <span className="text-xs text-gray-400">{selectedEnvIds.size} sélectionné(s)</span>
          </div>
          {envList && envList.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
              {envList.map((env) => (
                <label
                  key={env.id}
                  className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedEnvIds.has(env.id)}
                    onChange={() => toggleEnv(env.id)}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span className="text-sm text-gray-700 truncate">{env.nom}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucun environnement disponible</p>
          )}
        </section>

        {/* ── Dates ──────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Dates</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Début réel
              </label>
              <input
                type="date"
                className={inputClass}
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Début prévu
              </label>
              <input
                type="date"
                className={inputClass}
                value={dateDebutPrevue}
                onChange={(e) => setDateDebutPrevue(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Fin réelle
              </label>
              <input
                type="date"
                className={inputClass}
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                Fin prévue <span className="font-normal text-gray-300 normal-case">(calculée)</span>
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 text-sm border border-gray-100 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
                value={isoToDateInput(eng.date_fin_prevue)}
                disabled
              />
            </div>
          </div>
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
            Images ({eng.obj.images.length})
          </h2>
          <ImageManager
            objId={eng.obj.id}
            images={eng.obj.images}
            queryKey={['eng', engId]}
          />
        </section>

        {/* ── Documents ──────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Documents ({eng.obj.documents.length})
          </h2>
          <DocManager
            objId={eng.obj.id}
            documents={eng.obj.documents}
            queryKey={['eng', engId]}
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
            onClick={() => navigate(`/eng/${engId}`)}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending || !nom.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
