/**
 * OrgEditPage — formulaire d'édition d'une ORG
 *
 * Permet de modifier :
 *  • Nom (obj.nom)
 *  • Type (torg_id)
 *  • Description (obj.description — Markdown)
 *  • Toutes les propriétés (values via ValueField)
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { orgApi, torgApi } from '@/services/api'
import type { Org, Torg } from '@/types'
import ValueField, { type ValueDraft, emptyDraft } from '@/components/shared/ValueField'
import ImageManager from '@/components/shared/ImageManager'

// ─── Helpers ──────────────────────────────────────────────────

/** Construit un draft initial à partir des values existantes d'un OBJ */
function buildDrafts(org: Org): Map<number, ValueDraft> {
  const map = new Map<number, ValueDraft>()
  for (const val of org.obj.values) {
    const pid = val.prop.id   // prop_id n'est pas retourné au niveau racine par l'API
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

/** Aplatit l'arbre TORG en liste pour le select */
function flattenTorg(nodes: Torg[], depth = 0): { id: number; label: string }[] {
  const result: { id: number; label: string }[] = []
  for (const node of nodes) {
    result.push({ id: node.id, label: '  '.repeat(depth) + node.nom })
    if (node.enfants?.length) {
      result.push(...flattenTorg(node.enfants, depth + 1))
    }
  }
  return result
}

// ─── Page ─────────────────────────────────────────────────────

export default function OrgEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const orgId = Number(id)

  // ── Chargement des données ────────────────────────────────
  const { data: org, isLoading: orgLoading } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => orgApi.get(orgId).then((r) => r.data as Org),
    enabled: !isNaN(orgId),
  })

  const { data: torgTree } = useQuery({
    queryKey: ['torg', 'tree'],
    queryFn: () => torgApi.tree().then((r) => r.data as Torg[]),
  })

  // ── État du formulaire ────────────────────────────────────
  const [nom, setNom] = useState('')
  const [torgId, setTorgId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())

  // Initialiser les champs une fois l'ORG chargée
  useEffect(() => {
    if (!org) return
    setNom(org.obj.nom)
    setTorgId(org.torg.id)
    setDescription(org.obj.description ?? '')
    const newDrafts = buildDrafts(org)
    // Ajouter les drafts vides pour les PROP de la CLA sans VALUE existante
    for (const prop of org.obj.cla.props ?? []) {
      if (!newDrafts.has(prop.id)) {
        newDrafts.set(prop.id, emptyDraft(prop.id))
      }
    }
    setDrafts(newDrafts)
  }, [org])

  // ── Mutation ──────────────────────────────────────────────
  const { mutate: save, isPending, error } = useMutation({
    mutationFn: () => {
      const values = Array.from(drafts.values())
      return orgApi.update(orgId, {
        nom: nom.trim() || undefined,
        torg_id: torgId ?? undefined,
        description: description || undefined,
        values,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org', orgId] })
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      navigate(`/org/${orgId}`)
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
  if (orgLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" />
        <span>Chargement…</span>
      </div>
    )
  }
  if (!org) {
    return <p className="p-6 text-red-500">Organisation introuvable.</p>
  }

  const torgOptions = torgTree ? flattenTorg(torgTree) : []

  // Props directes de la CLA (toutes, même sans VALUE) + props héritées (depuis les VALUES)
  const claPropsSet = new Set((org.obj.cla.props ?? []).map((p) => p.id))

  const propsToDisplay = [
    // Props directes de la CLA — toutes, même sans VALUE
    ...(org.obj.cla.props ?? []).map((p) => ({
      prop: p,
      draft: drafts.get(p.id) ?? emptyDraft(p.id),
    })),
    // Props héritées — uniquement celles avec une VALUE existante
    ...org.obj.values
      .filter((v) => !claPropsSet.has(v.prop.id))
      .map((v) => ({ prop: v.prop, draft: drafts.get(v.prop.id) ?? emptyDraft(v.prop.id) })),
  ]

  // FastAPI peut renvoyer detail comme string OU comme tableau d'objets (validation 422)
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
          onClick={() => navigate(`/org/${orgId}`)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modifier l'organisation</h1>
          <p className="text-sm text-gray-400">{org.obj.nom}</p>
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </div>

          {/* Type TORG */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Type d'organisation
            </label>
            <select
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              value={torgId ?? ''}
              onChange={(e) => setTorgId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Choisir un type —</option>
              {torgOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        </section>

        {/* ── Description ────────────────────────────────── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Description</h2>
          <textarea
            rows={5}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono resize-y"
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
            Images ({org.obj.images.length})
          </h2>
          <ImageManager
            objId={org.obj.id}
            images={org.obj.images}
            queryKey={['org', orgId]}
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
            onClick={() => navigate(`/org/${orgId}`)}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending || !nom.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  )
}
