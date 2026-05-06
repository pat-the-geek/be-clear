/**
 * EngCreatePage — formulaire de création d'un ENG
 *
 * Permet de définir :
 *  • Nom (obj.nom)
 *  • Type (teng_id) — déclenche le chargement des PROP via la CLA
 *  • Organisations liées (org_ids)
 *  • Environnements liés (env_ids)
 *  • Dates (début réel, début prévu, fin prévue)
 *  • Description (obj.description — Markdown)
 *  • Toutes les propriétés de la CLA (values via ValueField)
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2, X, Star } from 'lucide-react'
import { engApi, tengApi, orgApi, envApi, claApi } from '@/services/api'
import type { Teng, OrgBrief, EnvBrief, PaginatedResponse, Prop } from '@/types'
import { useAutoResize } from '@/hooks/useAutoResize'
import ValueField, { type ValueDraft, emptyDraft } from '@/components/shared/ValueField'

const today = () => new Date().toISOString().slice(0, 10)

// ─── Page ─────────────────────────────────────────────────────

export default function EngCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const preselectedOrgId = searchParams.get('org') ? Number(searchParams.get('org')) : null
  const preselectedEnvId = searchParams.get('env') ? Number(searchParams.get('env')) : null

  // ── État du formulaire ────────────────────────────────────
  const [nom, setNom] = useState('')
  const [tengId, setTengId] = useState<number | null>(null)
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<number>>(
    preselectedOrgId ? new Set([preselectedOrgId]) : new Set()
  )
  const [selectedEnvIds, setSelectedEnvIds] = useState<Set<number>>(
    preselectedEnvId ? new Set([preselectedEnvId]) : new Set()
  )
  const [dateDebut, setDateDebut] = useState(today())
  const [dateDebutPrevue, setDateDebutPrevue] = useState(today())
  const [dateFinPrevue, setDateFinPrevue] = useState('')
  const [description, setDescription] = useState('')
  const descRef = useAutoResize(description)
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())
  const [orgPrincipaleId, setOrgPrincipaleId] = useState<number | null>(null)
  const [envPrincipaleId, setEnvPrincipaleId] = useState<number | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const [claId, setClaId] = useState<number | null>(null)

  // ── Chargement des listes ─────────────────────────────────
  const { data: tengList } = useQuery({
    queryKey: ['teng', 'list'],
    queryFn: () => tengApi.list().then((r) => r.data as Teng[]),
  })

  const { data: orgList } = useQuery({
    queryKey: ['orgs', 'all-brief'],
    queryFn: () => orgApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<OrgBrief>).items),
  })

  const { data: envList } = useQuery({
    queryKey: ['envs', 'all-brief'],
    queryFn: () => envApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<EnvBrief>).items),
  })

  const { data: claProps = [], isLoading: propsLoading } = useQuery({
    queryKey: ['cla-props-all', claId],
    queryFn: () => claApi.propsAll(claId!).then((r) => r.data as Prop[]),
    enabled: !!claId,
  })

  // Quand TENG change : mettre à jour la CLA (et vider les drafts)
  useEffect(() => {
    if (!tengId || !tengList) {
      setClaId(null)
      setDrafts(new Map())
      return
    }
    const teng = tengList.find((t) => t.id === tengId)
    if (teng) setClaId(teng.cla.id)
  }, [tengId, tengList])

  // Quand les PROP changent : reconstruire les drafts vides
  useEffect(() => {
    setDrafts(new Map(claProps.map((p) => [p.id, emptyDraft(p.id)])))
  }, [claProps])

  // ── Mutation ──────────────────────────────────────────────
  const { mutateAsync: createAsync, isPending, isSuccess, error } = useMutation({
    mutationFn: () => {
      const teng = (tengList ?? []).find((t) => t.id === tengId)
      return engApi.create({
        nom: nom.trim(),
        teng_id: tengId!,
        cla_id: teng!.cla.id,
        org_ids: [...selectedOrgIds],
        env_ids: [...selectedEnvIds],
        org_principale_id: orgPrincipaleId ?? undefined,
        env_principale_id: envPrincipaleId ?? undefined,
        date_debut: dateDebut || undefined,
        date_debut_prevue: dateDebutPrevue || undefined,
        date_fin_prevue: dateFinPrevue || undefined,
        description: description || undefined,
        values: Array.from(drafts.values()),
      })
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPending || isSuccess) return
    if (selectedOrgIds.size === 0 && selectedEnvIds.size === 0) {
      setSelectionError('Sélectionnez au moins 1 organisation ou 1 environnement.')
      return
    }
    setSelectionError(null)
    try {
      const res = await createAsync()
      queryClient.invalidateQueries({ queryKey: ['engs'] })
      queryClient.invalidateQueries({ queryKey: ['panel'] })
      navigate(`/eng/${res.data.id}`)
    } catch {
      // erreur exposée via `error`
    }
  }

  const updateDraft = (updated: ValueDraft) => {
    setDrafts((prev) => new Map(prev).set(updated.prop_id, updated))
  }

  const toggleOrg = (id: number) => {
    setSelectionError(null)
    setSelectedOrgIds((prev) => {
      const s = new Set(prev)
      if (s.has(id)) {
        s.delete(id)
        if (orgPrincipaleId === id) setOrgPrincipaleId(null)
      } else {
        s.add(id)
      }
      return s
    })
  }

  const toggleEnv = (id: number) => {
    setSelectionError(null)
    setSelectedEnvIds((prev) => {
      const s = new Set(prev)
      if (s.has(id)) {
        s.delete(id)
        if (envPrincipaleId === id) setEnvPrincipaleId(null)
      } else {
        s.add(id)
      }
      return s
    })
  }

  // ── Normalisation de l'erreur API ─────────────────────────
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

  const canSubmit = !!nom.trim() && !!tengId && !isPending && !isSuccess

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/eng')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouvel engagement</h1>
          <p className="text-sm text-gray-400">Créer un engagement</p>
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
              placeholder="Nom de l'engagement"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Type d'engagement <span className="text-red-500">*</span>
            </label>
            <select
              required
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

        {/* ── Organisations liées ─────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Organisations
              {orgPrincipaleId && orgList && (
                <span className="ml-2 font-normal normal-case text-amber-500">
                  — {orgList.find((o) => o.id === orgPrincipaleId)?.nom}
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-400">{selectedOrgIds.size} sélectionnée(s)</span>
          </div>
          {!orgList ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : orgList.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
                {orgList.map((org) => {
                  const checked = selectedOrgIds.has(org.id)
                  const isPrincipale = orgPrincipaleId === org.id
                  return (
                    <div
                      key={org.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOrg(org.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                        />
                        <span className={`text-sm truncate ${checked ? 'text-blue-800 font-medium' : 'text-gray-700'}`}>
                          {org.nom}
                        </span>
                      </label>
                      {checked && (
                        <button
                          type="button"
                          onClick={() => setOrgPrincipaleId(isPrincipale ? null : org.id)}
                          className={`shrink-0 transition-colors ${isPrincipale ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                          title={isPrincipale ? 'Retirer principale' : 'Définir comme principale'}
                        >
                          <Star size={13} fill={isPrincipale ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400">Cliquez sur ★ pour désigner l'ORG principale</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Aucune organisation disponible</p>
          )}
        </section>

        {/* ── Environnements liés ─────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Environnements
              {envPrincipaleId && envList && (
                <span className="ml-2 font-normal normal-case text-amber-500">
                  — {envList.find((e) => e.id === envPrincipaleId)?.nom}
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-400">{selectedEnvIds.size} sélectionné(s)</span>
          </div>
          {!envList ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : envList.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto">
                {envList.map((env) => {
                  const checked = selectedEnvIds.has(env.id)
                  const isPrincipale = envPrincipaleId === env.id
                  return (
                    <div
                      key={env.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${checked ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                    >
                      <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEnv(env.id)}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 shrink-0"
                        />
                        <span className={`text-sm truncate ${checked ? 'text-orange-800 font-medium' : 'text-gray-700'}`}>
                          {env.nom}
                        </span>
                      </label>
                      {checked && (
                        <button
                          type="button"
                          onClick={() => setEnvPrincipaleId(isPrincipale ? null : env.id)}
                          className={`shrink-0 transition-colors ${isPrincipale ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                          title={isPrincipale ? 'Retirer principal' : 'Définir comme principal'}
                        >
                          <Star size={13} fill={isPrincipale ? 'currentColor' : 'none'} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400">Cliquez sur ★ pour désigner l'ENV principal</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Aucun environnement disponible</p>
          )}
        </section>

        {selectionError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {selectionError}
          </div>
        )}

        {/* ── Dates ──────────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Dates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                Fin prévue
                <span className="ml-1 text-[10px] text-gray-400 normal-case font-normal">(optionnel)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  className={`flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent`}
                  value={dateFinPrevue}
                  onChange={(e) => setDateFinPrevue(e.target.value)}
                />
                {dateFinPrevue && (
                  <button
                    type="button"
                    onClick={() => setDateFinPrevue('')}
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
        {tengId && propsLoading && (
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
            onClick={() => navigate('/eng')}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Créer
          </button>
        </div>
      </form>
    </div>
  )
}
