import { useEffect, useState } from 'react'
import { useAutoResize } from '@/hooks/useAutoResize'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { engApi, tengApi, orgApi, envApi } from '@/services/api'
import { Modal } from '@/components/shared/Modal'
import type { Teng, OrgBrief, EnvBrief, PaginatedResponse } from '@/types'

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
  /** Pré-sélectionne une ORG (mode contextuel) */
  orgId?: number
  /** Pré-sélectionne un ENV (mode contextuel) */
  envId?: number
  /** Titre du modal — défaut : "Nouvel engagement" */
  entityNom?: string
  onCreated?: (engId: number) => void
}

export default function CreateEngModal({ open, onClose, orgId, envId, entityNom, onCreated }: Props) {
  const queryClient = useQueryClient()
  const isGlobal = orgId == null && envId == null

  // Sélection manuelle (mode global uniquement)
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<number>>(new Set())
  const [selectedEnvIds, setSelectedEnvIds] = useState<Set<number>>(new Set())

  const { data: tengList } = useQuery({
    queryKey: ['teng', 'list'],
    queryFn: () => tengApi.list().then((r) => r.data as Teng[]),
    enabled: open,
  })

  const { data: orgList } = useQuery({
    queryKey: ['orgs', 'all-brief'],
    queryFn: () => orgApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<OrgBrief>).items),
    enabled: open && isGlobal,
  })

  const { data: envList } = useQuery({
    queryKey: ['envs', 'all-brief'],
    queryFn: () => envApi.list({ per_page: 200 }).then((r) => (r.data as PaginatedResponse<EnvBrief>).items),
    enabled: open && isGlobal,
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { teng_id: 0 },
  })

  const [selectionError, setSelectionError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const teng = (tengList ?? []).find((t) => t.id === data.teng_id)
      if (!teng) throw new Error('TENG introuvable')

      const finalOrgIds = orgId != null ? [orgId] : [...selectedOrgIds]
      const finalEnvIds = envId != null ? [envId] : [...selectedEnvIds]

      if (isGlobal && finalOrgIds.length === 0 && finalEnvIds.length === 0) {
        setSelectionError('Sélectionnez au moins 1 organisation ou 1 environnement.')
        throw new Error('Sélection requise')
      }

      return engApi.create({
        nom: data.nom,
        teng_id: data.teng_id,
        cla_id: teng.cla.id,
        org_ids: finalOrgIds,
        env_ids: finalEnvIds,
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

  useEffect(() => {
    if (open) {
      form.reset({ teng_id: 0, date_debut: today(), date_debut_prevue: today() })
      mutation.reset()
      setSelectionError(null)
      setSelectedOrgIds(new Set())
      setSelectedEnvIds(new Set())
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    form.reset({ teng_id: 0 })
    mutation.reset()
    setSelectionError(null)
    setSelectedOrgIds(new Set())
    setSelectedEnvIds(new Set())
    onClose()
  }

  function toggleOrg(id: number) {
    setSelectionError(null)
    setSelectedOrgIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleEnv(id: number) {
    setSelectionError(null)
    setSelectedEnvIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function handleSubmit(data: FormData) {
    if (isGlobal && selectedOrgIds.size === 0 && selectedEnvIds.size === 0) {
      setSelectionError('Sélectionnez au moins 1 organisation ou 1 environnement.')
      return
    }
    mutation.mutate(data)
  }

  const descValue = form.watch('description') ?? ''
  const descRef = useAutoResize(descValue)
  const { ref: rhfDescRef, ...descReg } = form.register('description')

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const title = entityNom ? `Nouvel engagement — ${entityNom}` : 'Nouvel engagement'

  return (
    <Modal open={open} onClose={handleClose} title={title} size={isGlobal ? 'lg' : 'md'}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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

        {/* Sélection ORG/ENV (mode global uniquement) */}
        {isGlobal && (
          <div className="grid grid-cols-2 gap-3">
            {/* ORGs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organisations{' '}
                <span className="text-gray-400 font-normal">({selectedOrgIds.size})</span>
              </label>
              <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto p-2 bg-white space-y-0.5">
                {(orgList ?? []).length === 0
                  ? <p className="text-xs text-gray-400 px-2 py-3 text-center">Aucune ORG</p>
                  : (orgList ?? []).map((o) => (
                    <label key={o.id} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedOrgIds.has(o.id)}
                        onChange={() => toggleOrg(o.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-700 truncate">{o.nom}</span>
                    </label>
                  ))
                }
              </div>
            </div>

            {/* ENVs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Environnements{' '}
                <span className="text-gray-400 font-normal">({selectedEnvIds.size})</span>
              </label>
              <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto p-2 bg-white space-y-0.5">
                {(envList ?? []).length === 0
                  ? <p className="text-xs text-gray-400 px-2 py-3 text-center">Aucun ENV</p>
                  : (envList ?? []).map((e) => (
                    <label key={e.id} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedEnvIds.has(e.id)}
                        onChange={() => toggleEnv(e.id)}
                        className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-xs text-gray-700 truncate">{e.nom}</span>
                    </label>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {selectionError && (
          <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{selectionError}</p>
        )}

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
            {...descReg}
            ref={(el) => { rhfDescRef(el); descRef(el) }}
            className={`${inputClass} resize-none font-mono min-h-[80px]`}
            placeholder={'# Titre\n\nDescription en Markdown…'}
          />
        </div>

        {mutation.isError && (mutation.error as Error)?.message !== 'Sélection requise' && (
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
