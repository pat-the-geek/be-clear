/**
 * OrgCreatePage — formulaire de création d'une ORG
 *
 * Permet de définir :
 *  • Nom (obj.nom)
 *  • Type (torg_id) — déclenche le chargement des PROP via la CLA
 *  • Description (obj.description — Markdown)
 *  • Toutes les propriétés de la CLA (values via ValueField)
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { orgApi, torgApi, claApi } from '@/services/api'
import type { Torg, Prop } from '@/types'
import ValueField, { type ValueDraft, emptyDraft } from '@/components/shared/ValueField'

// ─── Helpers ──────────────────────────────────────────────────

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

/** Cherche un nœud TORG dans l'arbre par son id */
function findNode<T extends { id: number; enfants?: T[] }>(nodes: T[], id: number): T | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.enfants?.length) {
      const found = findNode(n.enfants, id)
      if (found) return found
    }
  }
}

// ─── Page ─────────────────────────────────────────────────────

export default function OrgCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── État du formulaire ────────────────────────────────────
  const [nom, setNom] = useState('')
  const [torgId, setTorgId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [drafts, setDrafts] = useState<Map<number, ValueDraft>>(new Map())
  const [claId, setClaId] = useState<number | null>(null)

  // ── Chargement de l'arbre TORG ────────────────────────────
  const { data: torgTree } = useQuery({
    queryKey: ['torg', 'tree'],
    queryFn: () => torgApi.tree().then((r) => r.data as Torg[]),
  })

  // ── Chargement des PROP pour la CLA sélectionnée ─────────
  const { data: claProps = [], isLoading: propsLoading } = useQuery({
    queryKey: ['cla-props-all', claId],
    queryFn: () => claApi.propsAll(claId!).then((r) => r.data as Prop[]),
    enabled: !!claId,
  })

  // Quand le TORG change : trouver la CLA correspondante dans l'arbre
  useEffect(() => {
    if (!torgId || !torgTree) {
      setClaId(null)
      setDrafts(new Map())
      return
    }
    const torg = findNode(torgTree, torgId)
    if (torg) {
      setClaId(torg.cla.id)
    }
  }, [torgId, torgTree])

  // Quand les PROP changent : reconstruire les drafts vides
  useEffect(() => {
    setDrafts(new Map(claProps.map((p) => [p.id, emptyDraft(p.id)])))
  }, [claProps])

  // ── Mutation ──────────────────────────────────────────────
  const { mutate: create, isPending, error } = useMutation({
    mutationFn: () =>
      orgApi.create({
        nom: nom.trim(),
        torg_id: torgId!,
        cla_id: claId!,
        description: description || undefined,
        values: Array.from(drafts.values()),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      navigate(`/org/${res.data.id}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    create()
  }

  const updateDraft = (updated: ValueDraft) => {
    setDrafts((prev) => new Map(prev).set(updated.prop_id, updated))
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

  const torgOptions = torgTree ? flattenTorg(torgTree) : []

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/org')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Retour"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouvelle organisation</h1>
          <p className="text-sm text-gray-400">Créer une organisation</p>
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
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Nom de l'organisation"
            />
          </div>

          {/* Type TORG */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Type d'organisation <span className="text-red-500">*</span>
            </label>
            <select
              required
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
        {torgId && propsLoading && (
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
            onClick={() => navigate('/org')}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending || !nom.trim() || !torgId}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Créer
          </button>
        </div>
      </form>
    </div>
  )
}
