import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Edit, CalendarDays, RefreshCw, Hash, Trash2, FileOutput, ChevronDown, Plus } from 'lucide-react'
import { orgApi, rptApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, formatDateTime } from '@/lib/utils'
import EntityAvatar from '@/components/shared/EntityAvatar'
import ImageManager from '@/components/shared/ImageManager'
import DocManager from '@/components/shared/DocManager'
import UrlValueDisplay from '@/components/shared/UrlValueDisplay'
import EngTable from '@/components/shared/EngTable'
import CreateEngModal from '@/components/shared/CreateEngModal'
import type { Org, Prop, Value } from '@/types'

// ─── Composant : rendu Markdown uniforme ────────────────────

function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mb-2 mt-3">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-gray-900 mb-1.5 mt-3">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-1 mt-2">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-gray-700 mb-2 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="text-sm list-disc list-inside space-y-1 mb-2 text-gray-700">{children}</ul>,
        ol: ({ children }) => <ol className="text-sm list-decimal list-inside space-y-1 mb-2 text-gray-700">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-gray-700">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        em: ({ children }) => <em className="italic text-gray-600">{children}</em>,
        code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
          inline
            ? <code className="font-mono text-xs bg-gray-100 text-gray-800 px-1 py-0.5 rounded">{children}</code>
            : <code>{children}</code>,
        pre: ({ children }) => <pre className="bg-gray-800 text-green-300 text-xs rounded-lg p-3 overflow-x-auto my-2">{children}</pre>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-500 italic text-sm my-2">{children}</blockquote>,
        a: ({ href, children }) => <a href={href} className="text-blue-600 underline hover:text-blue-700">{children}</a>,
        table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-sm border-collapse">{children}</table></div>,
        thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
        tr: ({ children }) => <tr className="border-b border-gray-200">{children}</tr>,
        th: ({ children }) => <th className="text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-gray-700">{children}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

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
      display = <Markdown>{value.valeur_texte}</Markdown>
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

// ─── Composant : section titre ───────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditeur = useAuthStore((s) => s.isEditeur)

  const orgId = Number(id)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRptMenu, setShowRptMenu] = useState(false)
  const [rptResult, setRptResult] = useState<{ chemin: string; nom_fichier: string } | null>(null)
  const [showCreateEng, setShowCreateEng] = useState(false)

  const { data: org, isLoading, isError } = useQuery({
    queryKey: ['org', orgId],
    queryFn: () => orgApi.get(orgId).then((r) => r.data as Org),
    enabled: !isNaN(orgId),
  })

  const { mutate: applyDescription } = useMutation({
    mutationFn: (description: string) =>
      orgApi.update(orgId, { description }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org', orgId] }),
  })

  const { mutate: generateRpt, isPending: isGeneratingRpt } = useMutation({
    mutationFn: async (destination: 'filesystem' | 'obsidian' | 'download') => {
      if (destination === 'download') {
        const res = await rptApi.downloadOrg(orgId)
        const blob = new Blob([res.data], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const cd = res.headers['content-disposition'] ?? ''
        const match = cd.match(/filename="?([^"]+)"?/)
        a.download = match ? match[1] : `rapport_org_${orgId}.md`
        a.href = url
        a.click()
        URL.revokeObjectURL(url)
        return null
      }
      return rptApi.org(orgId, destination).then(r => r.data)
    },
    onSuccess: (data) => { if (data) setRptResult(data); setShowRptMenu(false) },
  })

  const { mutateAsync: deleteOrg, isPending: isDeleting } = useMutation({
    mutationFn: () => orgApi.delete(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgs'] })
      window.location.href = '/org'
    },
  })

  if (isLoading) return <div className="p-6 text-center text-gray-400 py-16">Chargement…</div>
  if (isError || !org) return <div className="p-6 text-center text-red-500 py-16">Impossible de charger cette organisation.</div>

  const imagePrincipale = org.obj.images.find((i) => i.est_principale)

  // Fusion props CLA + values : toutes les props s'affichent, valeur ou "—"
  const valueByPropId = new Map(org.obj.values.map((v) => [v.prop.id, v]))
  const claProps = org.obj.cla.props ?? []
  // Props avec valeur hors CLA directe (props héritées déjà valuées)
  const claPropsIds = new Set(claProps.map((p) => p.id))
  const inheritedValues = org.obj.values.filter((v) => !claPropsIds.has(v.prop.id))

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
        <EntityAvatar type="org" nom={org.obj.nom} image={imagePrincipale} size="lg" />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{org.obj.nom}</h1>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  {org.torg.nom}
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
                        onClick={() => deleteOrg()}
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
                        onClick={() => navigate(`/org/${orgId}/edit`)}
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
      {org.obj.description && (
        <section className="mb-7">
          <SectionTitle>Description</SectionTitle>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <Markdown>{org.obj.description}</Markdown>
          </div>
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
      {(org.obj.images.length > 0 || isEditeur()) && (
        <section className="mb-7">
          <SectionTitle>Images ({org.obj.images.length})</SectionTitle>
          <ImageManager
            objId={org.obj.id}
            images={org.obj.images}
            queryKey={['org', orgId]}
            readOnly={!isEditeur()}
          />
        </section>
      )}

      {/* ─── Engagements ──────────────────────────────────── */}
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
        <EngTable orgId={orgId} />
      </section>

      <CreateEngModal
        open={showCreateEng}
        onClose={() => setShowCreateEng(false)}
        orgId={orgId}
        entityNom={org.obj.nom}
      />

      {/* ─── Documents ────────────────────────────────────── */}
      {(org.obj.documents.length > 0 || isEditeur()) && (
        <section className="mb-7">
          <SectionTitle>Documents ({org.obj.documents.length})</SectionTitle>
          <DocManager
            objId={org.obj.id}
            documents={org.obj.documents}
            queryKey={['org', orgId]}
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
              <p className="text-sm text-gray-700">{formatDateTime(org.obj.created_at)}</p>
              {org.obj.created_by && (
                <p className="text-xs text-gray-500 mt-0.5">par <span className="font-medium">{org.obj.created_by.nom}</span></p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
            <RefreshCw size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Modifié le</p>
              <p className="text-sm text-gray-700">{formatDateTime(org.obj.updated_at)}</p>
              {org.obj.updated_by && (
                <p className="text-xs text-gray-500 mt-0.5">par <span className="font-medium">{org.obj.updated_by.nom}</span></p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg col-span-2">
            <Hash size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Identifiant unique (UID)</p>
              <p className="text-xs font-mono text-gray-500 break-all">{org.obj.uid}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
