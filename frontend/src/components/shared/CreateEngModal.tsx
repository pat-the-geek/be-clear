import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { engApi, tengApi } from '@/services/api'
import { Modal } from '@/components/shared/Modal'
import type { Teng } from '@/types'

const today = () => new Date().toISOString().slice(0, 10)

const schema = z.object({
  nom: z.string().min(1, 'Nom requis'),
  teng_id: z.coerce.number().min(1, "Type d'engagement requis"),
  date_debut: z.string().optional(),
  date_debut_prevue: z.string().optional(),
  date_fin_prevue: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  /** ID de l'ORG à lier — exclusif avec envId */
  orgId?: number
  /** ID de l'ENV à lier — exclusif avec orgId */
  envId?: number
  /** Nom affiché dans le titre du modal */
  entityNom: string
  onCreated?: (engId: number) => void
}

export default function CreateEngModal({ open, onClose, orgId, envId, entityNom, onCreated }: Props) {
  const queryClient = useQueryClient()

  const { data: tengList } = useQuery({
    queryKey: ['teng', 'list'],
    queryFn: () => tengApi.list().then((r) => r.data as Teng[]),
    enabled: open,
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { teng_id: 0 },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const teng = (tengList ?? []).find((t) => t.id === data.teng_id)
      if (!teng) throw new Error('TENG introuvable')
      return engApi.create({
        nom: data.nom,
        teng_id: data.teng_id,
        cla_id: teng.cla.id,
        org_ids: orgId != null ? [orgId] : [],
        env_ids: envId != null ? [envId] : [],
        date_debut: data.date_debut || undefined,
        date_debut_prevue: data.date_debut_prevue || undefined,
        date_fin_prevue: data.date_fin_prevue || undefined,
        description: data.description || undefined,
        values: [],
      })
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['engs', 'table'] })
      queryClient.invalidateQueries({ queryKey: ['panel'] })
      if (envId != null) queryClient.invalidateQueries({ queryKey: ['engs', 'timeline', envId] })
      handleClose()
      onCreated?.(res.data.id)
    },
  })

  // Réinitialiser le formulaire à chaque ouverture
  useEffect(() => {
    if (open) {
      form.reset({ teng_id: 0, date_debut: today(), date_debut_prevue: today() })
      mutation.reset()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    form.reset({ teng_id: 0 })
    mutation.reset()
    onClose()
  }

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <Modal open={open} onClose={handleClose} title={`Nouvel engagement — ${entityNom}`}>
      <form
        onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
        className="space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
          <input
            {...form.register('nom')}
            className={inputClass}
            placeholder="Nom de l'engagement"
            autoFocus
          />
          {form.formState.errors.nom && (
            <p className="text-red-500 text-xs mt-1">{form.formState.errors.nom.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type d'engagement *</label>
          <select {...form.register('teng_id')} className={inputClass}>
            <option value={0}>— Sélectionner —</option>
            {(tengList ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.nom}</option>
            ))}
          </select>
          {form.formState.errors.teng_id && (
            <p className="text-red-500 text-xs mt-1">{form.formState.errors.teng_id.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Début réel</label>
            <input type="date" {...form.register('date_debut')} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Début prévu</label>
            <input type="date" {...form.register('date_debut_prevue')} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fin prévue <span className="text-gray-400 font-normal">(optionnel)</span>
          </label>
          <div className="flex items-center gap-2">
            <input type="date" {...form.register('date_fin_prevue')} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {form.watch('date_fin_prevue') && (
              <button
                type="button"
                onClick={() => form.setValue('date_fin_prevue', '')}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                title="Effacer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400 font-normal">(Markdown)</span>
          </label>
          <textarea
            {...form.register('description')}
            rows={4}
            className={`${inputClass} resize-y font-mono`}
            placeholder={'# Titre\n\nDescription en Markdown…'}
          />
        </div>

        {mutation.isError && (
          <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {(mutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Erreur lors de la création.'}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || mutation.isSuccess}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
