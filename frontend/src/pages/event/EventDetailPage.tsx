import React, { useState } from 'react'
import { useAutoResize } from '@/hooks/useAutoResize'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Pencil, Loader2, Check, X, Edit, AlertTriangle } from 'lucide-react'
import { eventApi } from '@/services/api'
import MarkdownContent from '@/components/shared/MarkdownContent'
import UrlValueDisplay from '@/components/shared/UrlValueDisplay'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime } from '@/lib/utils'
import EntityAvatar from '@/components/shared/EntityAvatar'
import ImageManager from '@/components/shared/ImageManager'
import DocManager from '@/components/shared/DocManager'
import type { Event as AppEvent, Value } from '@/types'

// ─── Composant local : ligne PROP / VALUE ────────────────────

interface PropValueRowProps {
  label: string
  value: Value
}

function PropValueRow({ label, value }: PropValueRowProps) {
  const type = value.prop.type
  let display: React.ReactNode = '—'

  if (type === 'DATE' && value.valeur_date) {
    display = formatDateTime(value.valeur_date)
  } else if ((type === 'DATETIME' || type === 'HEURE') && value.valeur_date) {
    display = formatDateTime(value.valeur_date)
  } else if (type === 'BOOLEEN') {
    display = value.valeur_bool === true ? 'Oui' : value.valeur_bool === false ? 'Non' : '—'
  } else if (type === 'MONTANT' && value.valeur_nombre !== undefined) {
    display = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value.valeur_nombre)
  } else if (type === 'POURCENTAGE' && value.valeur_nombre !== undefined) {
    display = `${value.valeur_nombre} %`
  } else if (value.valeur_nombre !== undefined) {
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

  const isWide = type === 'MARKDOWN' || type === 'TEXTE' || type === 'URL'

  return (
    <tr className="border-t border-gray-100">
      <td className={`py-2 pr-4 text-sm font-medium text-gray-500 whitespace-nowrap ${isWide ? 'align-top w-1/3' : 'w-1/3'}`}>
        {label}
      </td>
      <td className="py-2 text-sm text-gray-900">
        {display}
      </td>
    </tr>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditeur = useAuthStore((s) => s.isEditeur)

  const eventId = Number(id)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')
  const descRef = useAutoResize(descDraft)

  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => eventApi.get(eventId).then((r) => r.data as AppEvent),
    enabled: !isNaN(eventId),
  })

  const { mutate: marquerAccompli, isPending } = useMutation({
    mutationFn: () =>
      eventApi.update(eventId, { date_heure_reelle: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['eng', event?.eng_id] })
    },
  })

  const { mutate: saveDesc, isPending: isSavingDesc } = useMutation({
    mutationFn: (description: string) => eventApi.update(eventId, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      setEditingDesc(false)
    },
  })

  if (isLoading) {
    return <div className="p-6 text-center text-gray-400 py-16">Chargement…</div>
  }

  if (isError || !event) {
    return <div className="p-6 text-center text-red-500 py-16">Impossible de charger cet évènement.</div>
  }

  const accompli = !!event.date_heure_reelle
  const overdue = !accompli && new Date(event.date_heure_prevue) < new Date()
  const dureeValeur = event.tevent.duree_prevue_valeur
  const dureeUnite = event.tevent.duree_prevue_unite

  function formatDuree(val?: number, unite?: string): string {
    if (val === undefined || !unite) return '—'
    const labels: Record<string, string> = {
      secondes: 'seconde', minutes: 'minute', heures: 'heure', jours: 'jour', mois: 'mois',
    }
    const label = labels[unite] ?? unite
    return `${val} ${label}${val > 1 && unite !== 'mois' ? 's' : ''}`
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Retour */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors"
      >
        <ArrowLeft size={15} />
        Retour
      </button>

      {/* ─── En-tête ──────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <EntityAvatar
            type="event"
            nom={event.obj.nom}
            image={event.obj.images.find(i => i.est_principale)}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                {event.obj.nom}
              </h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                {event.tevent.nom}
              </span>
              {overdue && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  <AlertTriangle size={11} />
                  En retard
                </span>
              )}
              {accompli && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <CheckCircle2 size={11} />
                  Accompli
                </span>
              )}
            </div>
            <Link to={`/eng/${event.eng_id}`} className="text-sm text-blue-600 hover:underline">
              {event.eng_nom ? `↑ ${event.eng_nom}` : "Voir l'engagement parent"}
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isEditeur() && (
            <button
              onClick={() => navigate(`/event/${eventId}/edit`)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Edit size={14} />
              Modifier
            </button>
          )}
          {isEditeur() && !accompli && (
            <button
              onClick={() => marquerAccompli()}
              disabled={isPending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle2 size={16} />
              {isPending ? 'Enregistrement…' : 'Marquer accompli'}
            </button>
          )}
        </div>
      </div>

      {/* ─── Dates ────────────────────────────── */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Dates</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Date prévue</p>
            <p className="text-sm font-medium text-gray-900">{formatDateTime(event.date_heure_prevue)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Date réelle</p>
            {event.date_heure_reelle ? (
              <>
                <p className="text-sm font-medium text-gray-900">{formatDateTime(event.date_heure_reelle)}</p>
                <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Accompli</span>
              </>
            ) : (
              <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">En attente</span>
            )}
          </div>
        </div>
      </section>

      {/* ─── Durée prévue ─────────────────────── */}
      {dureeValeur !== undefined && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Durée prévue</h2>
          <div className="bg-gray-50 rounded-lg p-4 inline-block">
            <p className="text-sm font-medium text-gray-900">{formatDuree(dureeValeur, dureeUnite)}</p>
          </div>
        </section>
      )}

      {/* ─── Description ──────────────────────── */}
      {(event.obj.description || isEditeur()) && (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Description</h2>
            {isEditeur() && !editingDesc && (
              <button
                onClick={() => { setDescDraft(event.obj.description ?? ''); setEditingDesc(true) }}
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
                placeholder="Description en Markdown (Mermaid et syntaxe Obsidian supportés)…"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setEditingDesc(false)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <X size={13} />
                  Annuler
                </button>
                <button
                  onClick={() => saveDesc(descDraft)}
                  disabled={isSavingDesc}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
                >
                  {isSavingDesc ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Enregistrer
                </button>
              </div>
            </div>
          ) : event.obj.description ? (
            <MarkdownContent>{event.obj.description}</MarkdownContent>
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
      {event.obj.values.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Propriétés</h2>
          <div className="bg-white rounded-lg border border-gray-200 px-4 overflow-hidden">
            <table className="w-full">
              <tbody>
                {event.obj.values.map((val) => (
                  <PropValueRow key={val.id} label={val.prop.nom} value={val} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Images ───────────────────────────── */}
      {(event.obj.images.length > 0 || isEditeur()) && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Images ({event.obj.images.length})
          </h2>
          <ImageManager
            objId={event.obj.id}
            images={event.obj.images}
            queryKey={['event', eventId]}
            readOnly={!isEditeur()}
          />
        </section>
      )}

      {/* ─── Documents ────────────────────────── */}
      {(event.obj.documents.length > 0 || isEditeur()) && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Documents ({event.obj.documents.length})
          </h2>
          <DocManager
            objId={event.obj.id}
            documents={event.obj.documents}
            queryKey={['event', eventId]}
            readOnly={!isEditeur()}
          />
        </section>
      )}

    </div>
  )
}
