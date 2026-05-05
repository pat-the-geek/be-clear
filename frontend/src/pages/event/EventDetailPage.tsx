import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Pencil, Loader2, Check, X } from 'lucide-react'
import { eventApi, teventApi } from '@/services/api'
import MarkdownContent from '@/components/shared/MarkdownContent'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime } from '@/lib/utils'
import EntityAvatar from '@/components/shared/EntityAvatar'
import { Modal } from '@/components/shared/Modal'
import ImageManager from '@/components/shared/ImageManager'
import DocManager from '@/components/shared/DocManager'
import type { Event as AppEvent, Value, Tevent } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────

function isoToDatetimeLocal(iso?: string): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function datetimeLocalToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

// ─── Composant local : ligne PROP / VALUE ────────────────────

interface PropValueRowProps {
  label: string
  value: Value
}

function PropValueRow({ label, value }: PropValueRowProps) {
  const type = value.prop.type
  let display = '—'

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
  } else if (value.valeur_texte) {
    display = value.valeur_texte
  }

  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-4 text-sm font-medium text-gray-500 whitespace-nowrap w-1/3">
        {label}
      </td>
      <td className="py-2 text-sm text-gray-900">
        {type === 'URL' && value.valeur_texte ? (
          <a href={value.valeur_texte} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
            {value.valeur_texte}
          </a>
        ) : type === 'EMAIL' && value.valeur_texte ? (
          <a href={`mailto:${value.valeur_texte}`} className="text-blue-600 hover:underline">
            {value.valeur_texte}
          </a>
        ) : (
          <span>{display}</span>
        )}
      </td>
    </tr>
  )
}

// ─── Modal d'édition d'EVENT ─────────────────────────────────

interface EditModalProps {
  open: boolean
  onClose: () => void
  event: AppEvent
  onUpdated: () => void
}

function EditModal({ open, onClose, event, onUpdated }: EditModalProps) {
  const queryClient = useQueryClient()
  const [nom, setNom] = useState(event.obj.nom)
  const [teventId, setTeventId] = useState<number>(event.tevent.id)
  const [dateHeurePrevue, setDateHeurePrevue] = useState(isoToDatetimeLocal(event.date_heure_prevue))
  const [dateHeureReelle, setDateHeureReelle] = useState(isoToDatetimeLocal(event.date_heure_reelle))

  const { data: tevents } = useQuery<Tevent[]>({
    queryKey: ['tevents'],
    queryFn: () => teventApi.list().then((r) => r.data),
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      setNom(event.obj.nom)
      setTeventId(event.tevent.id)
      setDateHeurePrevue(isoToDatetimeLocal(event.date_heure_prevue))
      setDateHeureReelle(isoToDatetimeLocal(event.date_heure_reelle))
    }
  }, [open, event])

  const { mutate: save, isPending, error, reset } = useMutation({
    mutationFn: () =>
      eventApi.update(event.id, {
        nom: nom.trim(),
        tevent_id: teventId,
        date_heure_prevue: datetimeLocalToIso(dateHeurePrevue),
        date_heure_reelle: dateHeureReelle ? datetimeLocalToIso(dateHeureReelle) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', event.id] })
      queryClient.invalidateQueries({ queryKey: ['eng', event.eng_id] })
      onUpdated()
      onClose()
      reset()
    },
  })

  const canSubmit = nom.trim() && teventId && dateHeurePrevue

  return (
    <Modal open={open} onClose={onClose} title="Modifier l'évènement">
      <div className="space-y-4 p-1">
        {/* Nom */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="Nom de l'évènement"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type (TEVENT)</label>
          <select
            value={teventId}
            onChange={(e) => setTeventId(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {tevents?.map((t) => (
              <option key={t.id} value={t.id}>{t.nom}</option>
            ))}
          </select>
        </div>

        {/* Date prévue */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date et heure prévues</label>
          <input
            type="datetime-local"
            value={dateHeurePrevue}
            onChange={(e) => setDateHeurePrevue(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </div>

        {/* Date réelle */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-500">Date et heure réelles</label>
            {!dateHeureReelle && (
              <button
                type="button"
                onClick={() => setDateHeureReelle(isoToDatetimeLocal(new Date().toISOString()))}
                className="text-xs text-green-600 hover:underline font-medium"
              >
                Maintenant
              </button>
            )}
          </div>
          <input
            type="datetime-local"
            value={dateHeureReelle}
            onChange={(e) => setDateHeureReelle(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {dateHeureReelle && (
            <button
              type="button"
              onClick={() => setDateHeureReelle('')}
              className="mt-1 text-xs text-red-500 hover:underline"
            >
              Effacer (marquer non accompli)
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {(error as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Erreur lors de la sauvegarde'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => { onClose(); reset() }}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={!canSubmit || isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Page principale ─────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditeur = useAuthStore((s) => s.isEditeur)

  const eventId = Number(id)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState('')

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
            </div>
            <Link to={`/eng/${event.eng_id}`} className="text-sm text-blue-600 hover:underline">
              Voir l'engagement parent
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isEditeur() && (
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Pencil size={13} />
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
                rows={10}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white font-mono resize-y"
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
            <div className="bg-white rounded-lg border border-gray-200 px-6 py-4">
              <MarkdownContent>{event.obj.description}</MarkdownContent>
            </div>
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

      {/* ─── Modal d'édition ──────────────────── */}
      {event && (
        <EditModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          event={event}
          onUpdated={() => queryClient.invalidateQueries({ queryKey: ['event', eventId] })}
        />
      )}
    </div>
  )
}
