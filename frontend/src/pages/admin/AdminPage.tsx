import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Edit, ChevronRight, ChevronDown, List, X, Loader2, KeyRound, BarChart3, CheckCircle2, Clock, AlertTriangle, Users, Handshake, Globe, Building2, CalendarClock, Activity, UserCheck, UserX } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { claApi, logApi, torgApi, tenvApi, tengApi, teventApi, userApi, configApi, statsApi, searchApi, api } from '@/services/api'
import { toast } from '@/lib/toast'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Cla, ClaDetail, Prop, PropType, Torg, Tenv, Teng, Tevent } from '@/types'
import { Modal } from '@/components/shared/Modal'

// ─── Types locaux ────────────────────────────────────────────

interface RoleItem {
  id: number
  valeur: string
}

interface UserItem {
  id: number
  nom: string
  role?: RoleItem | null
  org_id?: number | null
  est_actif: boolean
  tuser: { id: number; valeur: string }
  auth_uid?: string | null
}

interface LogEntry {
  id: number
  table_name: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  entite_id: number | null
  horodatage: string
  user_nom: string | null
}

interface AppConfig {
  obsidian_vault_path?: string
  ollama_url?: string
  ollama_modele?: string
  oidc_enabled?: boolean
  oidc_issuer_url?: string
  oidc_client_id?: string
  oidc_scopes?: string
  oidc_allow_local_login?: boolean
}

interface LlmDistant {
  id: number
  nom: string
  fournisseur: string
  modele?: string
  api_url?: string
  api_key_hint?: string
}

interface PaginatedLog {
  items: LogEntry[]
  total: number
  page: number
  per_page: number
}

interface TuserItem {
  id: number
  valeur: string
}


// ─── Composants de formulaire utilitaires ─────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-red-500">{message}</p>
}

function FormField({ label, children, error, hint }: { label: string; children: React.ReactNode; error?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      <FieldError message={error} />
    </div>
  )
}

const inputClass = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400'
const selectClass = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'

function SubmitRow({ pending, label = 'Enregistrer', onCancel }: { pending: boolean; label?: string; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
        Annuler
      </button>
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
      >
        {pending ? 'Enregistrement…' : label}
      </button>
    </div>
  )
}

// ─── Hook: liste des classes ──────────────────────────────────

function useClaList() {
  return useQuery<Cla[]>({
    queryKey: ['cla', 'list'],
    queryFn: () => claApi.list().then((r) => r.data),
  })
}

// ─── Modal CLA ────────────────────────────────────────────────

const claSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  description: z.string().optional(),
  super_classe_id: z.string().optional(),
})
type ClaFormValues = z.infer<typeof claSchema>

interface ModalClaProps {
  open: boolean
  onClose: () => void
  initialData?: Cla
}

function ModalCla({ open, onClose, initialData }: ModalClaProps) {
  const qc = useQueryClient()
  const { data: classes } = useClaList()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ClaFormValues>({
    resolver: zodResolver(claSchema),
    defaultValues: { nom: '', description: '', super_classe_id: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        nom: initialData?.nom ?? '',
        description: initialData?.comportement ?? '',
        super_classe_id: initialData?.super_classe_id != null ? String(initialData.super_classe_id) : '',
      })
    }
  }, [open, initialData, reset])

  const { mutate: saveCla, isPending } = useMutation({
    mutationFn: (values: ClaFormValues) => {
      const payload = {
        nom: values.nom,
        comportement: values.description || undefined,
        super_classe_id: values.super_classe_id ? Number(values.super_classe_id) : undefined,
      }
      return initialData
        ? claApi.update(initialData.id, payload)
        : claApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cla'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Modifier la classe' : 'Nouvelle classe'}>
      <form onSubmit={handleSubmit((d) => saveCla(d))} className="space-y-4">
        <FormField label="Nom *" error={errors.nom?.message}>
          <input {...register('nom')} className={inputClass} />
        </FormField>
        <FormField label="Description (Markdown)" error={errors.description?.message}>
          <textarea {...register('description')} rows={3} className={inputClass} />
        </FormField>
        <FormField label="Super-classe" error={errors.super_classe_id?.message}>
          <select {...register('super_classe_id')} className={selectClass}>
            <option value="">— Aucune —</option>
            {classes?.filter((c) => c.id !== initialData?.id).map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </FormField>
        <SubmitRow pending={isPending || isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── Types de PROP ───────────────────────────────────────────

const PROP_TYPES: { value: PropType; label: string; color: string }[] = [
  { value: 'TEXTE',       label: 'Texte',        color: 'bg-gray-100 text-gray-700' },
  { value: 'MARKDOWN',    label: 'Markdown',     color: 'bg-gray-100 text-gray-700' },
  { value: 'ENTIER',      label: 'Entier',       color: 'bg-blue-100 text-blue-700' },
  { value: 'DECIMAL',     label: 'Décimal',      color: 'bg-blue-100 text-blue-700' },
  { value: 'MONTANT',     label: 'Montant',      color: 'bg-blue-100 text-blue-700' },
  { value: 'POURCENTAGE', label: 'Pourcentage',  color: 'bg-blue-100 text-blue-700' },
  { value: 'BOOLEEN',     label: 'Booléen',      color: 'bg-purple-100 text-purple-700' },
  { value: 'LISTE',       label: 'Liste',        color: 'bg-orange-100 text-orange-700' },
  { value: 'DATE',        label: 'Date',         color: 'bg-green-100 text-green-700' },
  { value: 'HEURE',       label: 'Heure',        color: 'bg-green-100 text-green-700' },
  { value: 'DATETIME',    label: 'Date + heure', color: 'bg-green-100 text-green-700' },
  { value: 'DUREE',       label: 'Durée',        color: 'bg-green-100 text-green-700' },
  { value: 'URL',         label: 'URL',          color: 'bg-cyan-100 text-cyan-700' },
  { value: 'EMAIL',       label: 'Email',        color: 'bg-cyan-100 text-cyan-700' },
  { value: 'TELEPHONE',   label: 'Téléphone',    color: 'bg-cyan-100 text-cyan-700' },
  { value: 'REFERENCE',   label: 'Référence',    color: 'bg-rose-100 text-rose-700' },
  { value: 'COORDONNEES', label: 'Coordonnées',  color: 'bg-rose-100 text-rose-700' },
]

function PropTypeBadge({ type }: { type: PropType }) {
  const def = PROP_TYPES.find((t) => t.value === type)
  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded ${def?.color ?? 'bg-gray-100 text-gray-500'}`}>
      {def?.label ?? type}
    </span>
  )
}

// ─── Modal gestion des PROP d'une CLA ────────────────────────

interface ModalPropsProps {
  open: boolean
  onClose: () => void
  cla: Cla
}

function ModalProps({ open, onClose, cla }: ModalPropsProps) {
  const qc = useQueryClient()

  const { data: detail, isLoading } = useQuery<ClaDetail>({
    queryKey: ['cla', cla.id, 'detail'],
    queryFn: () => claApi.get(cla.id).then((r) => r.data),
    enabled: open,
  })

  // ── Renommer une prop (inline) ────────────────────────────
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { mutate: saveName, isPending: isSavingName } = useMutation({
    mutationFn: ({ propId, nom }: { propId: number; nom: string }) =>
      claApi.updateProp(cla.id, propId, { nom }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cla'] })
      setRenamingId(null)
    },
  })

  function startRename(prop: Prop) {
    setRenamingId(prop.id)
    setRenameValue(prop.nom)
  }

  function commitRename(propId: number) {
    if (!renameValue.trim()) return
    saveName({ propId, nom: renameValue.trim() })
  }

  // ── Supprimer une prop ────────────────────────────────────
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const { mutate: deleteProp, isPending: isDeletingProp } = useMutation({
    mutationFn: (propId: number) => claApi.deleteProp(cla.id, propId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cla'] })
      setDeletingId(null)
    },
  })

  // ── Ajouter une prop ──────────────────────────────────────
  const [newNom, setNewNom] = useState('')
  const [newType, setNewType] = useState<PropType>('TEXTE')
  const [newValeursListe, setNewValeursListe] = useState('')
  const [addError, setAddError] = useState<string | null>(null)

  const { mutate: addProp, isPending: isAdding } = useMutation({
    mutationFn: () => {
      const valeurs_liste = newType === 'LISTE'
        ? newValeursListe.split(',').map((v) => v.trim()).filter(Boolean)
        : undefined
      return claApi.addProp(cla.id, { nom: newNom.trim(), type: newType, valeurs_liste })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cla'] })
      setNewNom('')
      setNewType('TEXTE')
      setNewValeursListe('')
      setAddError(null)
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAddError(detail ?? 'Erreur lors de la création.')
    },
  })

  function handleAddProp(e: React.FormEvent) {
    e.preventDefault()
    if (!newNom.trim()) return
    addProp()
  }

  const ownProps = detail?.props ?? cla.props
  const inheritedProps = detail?.props_heritees ?? []

  return (
    <Modal open={open} onClose={onClose} title={`Propriétés — ${cla.nom}`}>
      <div className="space-y-5 min-w-[480px]">

        {/* ── Props propres ─────────────────────────────── */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Propres ({ownProps.length})
          </h3>
          {isLoading && (
            <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Chargement…
            </div>
          )}
          {!isLoading && ownProps.length === 0 && (
            <p className="text-sm text-gray-400 py-2">Aucune propriété propre.</p>
          )}
          {!isLoading && ownProps.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {ownProps.map((prop) => (
                <div key={prop.id} className="flex items-center gap-2 px-3 py-2">
                  <PropTypeBadge type={prop.type} />
                  {renamingId === prop.id ? (
                    <input
                      autoFocus
                      className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(prop.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onBlur={() => commitRename(prop.id)}
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-900">{prop.nom}</span>
                  )}
                  {renamingId === prop.id ? (
                    <button onClick={() => setRenamingId(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={() => startRename(prop)}
                      disabled={isSavingName}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                      title="Renommer"
                    >
                      <Edit size={13} />
                    </button>
                  )}
                  {deletingId === prop.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-red-600">Supprimer ?</span>
                      <button
                        onClick={() => deleteProp(prop.id)}
                        disabled={isDeletingProp}
                        className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors"
                      >
                        {isDeletingProp ? <Loader2 size={12} className="animate-spin" /> : 'Oui'}
                      </button>
                      <button onClick={() => setDeletingId(null)} className="text-xs text-gray-500 hover:text-gray-700">Non</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(prop.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Ajouter une prop ──────────────────────────── */}
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Ajouter une propriété
          </h3>
          <form onSubmit={handleAddProp} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nom de la propriété"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newNom}
                onChange={(e) => setNewNom(e.target.value)}
                required
              />
              <select
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={newType}
                onChange={(e) => setNewType(e.target.value as PropType)}
              >
                {PROP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {newType === 'LISTE' && (
              <input
                type="text"
                placeholder="Valeurs séparées par des virgules : val1, val2, val3"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newValeursListe}
                onChange={(e) => setNewValeursListe(e.target.value)}
              />
            )}
            {addError && <p className="text-xs text-red-600">{addError}</p>}
            <button
              type="submit"
              disabled={isAdding || !newNom.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Ajouter
            </button>
          </form>
        </div>

        {/* ── Props héritées ────────────────────────────── */}
        {inheritedProps.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Héritées ({inheritedProps.length})
            </h3>
            <div className="bg-gray-50 rounded-lg border border-gray-100 divide-y divide-gray-100">
              {inheritedProps.map((prop) => (
                <div key={prop.id} className="flex items-center gap-2 px-3 py-2 opacity-70">
                  <PropTypeBadge type={prop.type} />
                  <span className="flex-1 text-sm text-gray-600">{prop.nom}</span>
                  <span className="text-[11px] text-gray-400 italic">héritée</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Onglet Classes ──────────────────────────────────────────

function TabClasses() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Cla | null>(null)
  const [propsTarget, setPropsTarget] = useState<Cla | null>(null)

  const { data: classes, isLoading, isError } = useQuery<Cla[]>({
    queryKey: ['cla', 'list'],
    queryFn: () => claApi.list().then((r) => r.data),
  })

  const qc = useQueryClient()
  const { mutate: deleteCla } = useMutation({
    mutationFn: (id: number) => claApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cla'] }),
  })

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Chargement…</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Erreur de chargement.</div>

  const claMap = Object.fromEntries((classes ?? []).map((c) => [c.id, c.nom]))

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-gray-800">Classes ({classes?.length ?? 0})</h3>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          Nouvelle classe
        </button>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Nom</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Super-classe</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Propriétés</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {classes?.map((cla) => (
              <tr key={cla.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900">{cla.nom}</td>
                <td className="px-4 py-2.5 text-gray-500">
                  {cla.super_classe_id ? (claMap[cla.super_classe_id] ?? `#${cla.super_classe_id}`) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <button
                    onClick={() => setPropsTarget(cla)}
                    className="flex items-center gap-1.5 text-gray-500 hover:text-blue-600 transition-colors text-xs"
                    title="Gérer les propriétés"
                  >
                    <List size={13} />
                    {cla.props.length} prop{cla.props.length !== 1 ? 's' : ''}
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditTarget(cla)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                      title="Modifier la classe"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Supprimer la classe « ${cla.nom} » ?`)) deleteCla(cla.id)
                      }}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalCla open={createOpen} onClose={() => setCreateOpen(false)} />
      <ModalCla open={editTarget !== null} onClose={() => setEditTarget(null)} initialData={editTarget ?? undefined} />
      {propsTarget && (
        <ModalProps open={propsTarget !== null} onClose={() => setPropsTarget(null)} cla={propsTarget} />
      )}
    </div>
  )
}

// ─── Modal USER ───────────────────────────────────────────────

const userSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  auth_uid: z.string().min(1, 'Le login technique est requis'),
  tuser_id: z.string().min(1, 'Le type est requis'),
  role_id: z.string().optional(),
  org_id: z.string().optional(),
  cla_id: z.string().optional(),
  password: z.string().optional(),
})
type UserFormValues = z.infer<typeof userSchema>

interface ModalUserProps {
  open: boolean
  onClose: () => void
  initialData?: UserItem
}

function ModalUser({ open, onClose, initialData }: ModalUserProps) {
  const qc = useQueryClient()

  const { data: tusers } = useQuery<TuserItem[]>({
    queryKey: ['tuser', 'list'],
    queryFn: () => api.get('/tuser').then((r) => r.data),
    enabled: open,
  })

  const { data: roles } = useQuery<RoleItem[]>({
    queryKey: ['user', 'roles'],
    queryFn: () => userApi.roles().then((r) => r.data),
    enabled: open,
  })

  const { data: classes } = useClaList()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { nom: '', auth_uid: '', tuser_id: '', role_id: '', org_id: '', cla_id: '', password: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        nom: initialData?.nom ?? '',
        auth_uid: initialData?.auth_uid ?? '',
        tuser_id: initialData?.tuser ? String(initialData.tuser.id) : '',
        role_id: initialData?.role ? String(initialData.role.id) : '',
        org_id: initialData?.org_id != null ? String(initialData.org_id) : '',
        cla_id: '',
        password: '',
      })
    }
  }, [open, initialData, reset])

  const { mutate: saveUser, isPending } = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload: Record<string, unknown> = {
        nom: values.nom,
        auth_uid: values.auth_uid,
        tuser_id: Number(values.tuser_id),
        role_id: values.role_id ? Number(values.role_id) : undefined,
        org_id: values.org_id ? Number(values.org_id) : undefined,
      }
      if (!initialData) {
        payload.cla_id = values.cla_id ? Number(values.cla_id) : undefined
        if (values.password) payload.password = values.password
      }
      return initialData
        ? userApi.update(initialData.id, payload)
        : userApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}>
      <form onSubmit={handleSubmit((d) => saveUser(d))} className="space-y-4">
        <FormField label="Nom *" error={errors.nom?.message}>
          <input {...register('nom')} className={inputClass} />
        </FormField>
        <FormField label="Login technique (auth_uid) *" error={errors.auth_uid?.message}>
          <input {...register('auth_uid')} className={inputClass} placeholder="ex: jdupont@example.com" />
        </FormField>
        <FormField label="Type d'utilisateur *" error={errors.tuser_id?.message}>
          <select {...register('tuser_id')} className={selectClass}>
            <option value="">— Sélectionner —</option>
            {tusers?.map((t) => (
              <option key={t.id} value={t.id}>{t.valeur}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Rôle" error={errors.role_id?.message}>
          <select {...register('role_id')} className={selectClass}>
            <option value="">— Aucun (non-humain) —</option>
            {roles?.map((r) => (
              <option key={r.id} value={r.id}>{r.valeur}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Organisation (ID)" error={errors.org_id?.message}>
          <input {...register('org_id')} type="number" className={inputClass} placeholder="optionnel" />
        </FormField>
        {!initialData && (
          <FormField label="Classe (OBJ) *" error={errors.cla_id?.message} hint="Classe utilisée pour l'identité de cet utilisateur">
            <select {...register('cla_id')} className={selectClass}>
              <option value="">— Sélectionner —</option>
              {classes?.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </FormField>
        )}
        {!initialData && (
          <FormField label="Mot de passe initial" error={errors.password?.message} hint="Optionnel — peut être défini ou modifié plus tard">
            <input {...register('password')} type="password" className={inputClass} autoComplete="new-password" />
          </FormField>
        )}
        <SubmitRow pending={isPending || isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── Modal Réinitialisation mot de passe ─────────────────────

interface ModalResetPasswordProps {
  open: boolean
  onClose: () => void
  userId: number
  userName: string
}

function ModalResetPassword({ open, onClose, userId, userName }: ModalResetPasswordProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [validationError, setValidationError] = useState('')

  const { mutate, isPending, isError, reset: resetMutation } = useMutation({
    mutationFn: () => userApi.setPassword(userId, password),
    onSuccess: () => {
      onClose()
      setPassword('')
      setConfirm('')
      setValidationError('')
    },
  })

  function handleClose() {
    onClose()
    setPassword('')
    setConfirm('')
    setValidationError('')
    resetMutation()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setValidationError('Le mot de passe doit contenir au moins 6 caractères.')
      return
    }
    if (password !== confirm) {
      setValidationError('Les mots de passe ne correspondent pas.')
      return
    }
    setValidationError('')
    mutate()
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Réinitialiser le mot de passe — ${userName}`}>
      <form onSubmit={handleSubmit} className="space-y-4 min-w-[320px]">
        <FormField label="Nouveau mot de passe *">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
            autoFocus
          />
        </FormField>
        <FormField label="Confirmer le mot de passe *">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
          />
        </FormField>
        {validationError && <p className="text-xs text-red-500">{validationError}</p>}
        {isError && <p className="text-xs text-red-500">Erreur lors de la mise à jour du mot de passe.</p>}
        <SubmitRow pending={isPending} label="Enregistrer" onCancel={handleClose} />
      </form>
    </Modal>
  )
}


// ─── Onglet Utilisateurs ─────────────────────────────────────

function TabUsers() {
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<UserItem | null>(null)
  const [resetPwdTarget, setResetPwdTarget] = useState<UserItem | null>(null)
  const qc = useQueryClient()

  const toggleActive = useMutation({
    mutationFn: (user: UserItem) => userApi.update(user.id, { est_actif: !user.est_actif }),
    onSuccess: (_data, user) => {
      qc.invalidateQueries({ queryKey: ['user'] })
      toast.success(user.est_actif ? 'Utilisateur désactivé' : 'Utilisateur réactivé')
    },
  })

  const { data: users, isLoading, isError } = useQuery<UserItem[]>({
    queryKey: ['user', 'list'],
    queryFn: () => userApi.list().then((r) => (r.data as { items: UserItem[] }).items),
  })

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Chargement…</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Erreur de chargement.</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-gray-800">Utilisateurs ({users?.length ?? 0})</h3>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          Nouvel utilisateur
        </button>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Nom</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Type</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Rôle</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-500">Statut</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {users?.map((user) => (
              <tr key={user.id} className="border-t border-gray-100">
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  <Link to={`/user/${user.id}`} className="hover:text-blue-600 hover:underline transition-colors">
                    {user.nom}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{user.tuser.valeur}</td>
                <td className="px-4 py-2.5">
                  {user.role ? (
                    <span
                      className={cn(
                        'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                        user.role.valeur === 'ADMIN'
                          ? 'bg-red-100 text-red-700'
                          : user.role.valeur === 'EDITEUR'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {user.role.valeur}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                      user.est_actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {user.est_actif ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleActive.mutate(user)}
                      disabled={toggleActive.isPending}
                      className={cn(
                        'transition-colors',
                        user.est_actif
                          ? 'text-gray-400 hover:text-red-600'
                          : 'text-gray-400 hover:text-green-600',
                      )}
                      title={user.est_actif ? 'Désactiver' : 'Réactiver'}
                    >
                      {user.est_actif ? <UserX size={14} /> : <UserCheck size={14} />}
                    </button>
                    <button
                      onClick={() => setResetPwdTarget(user)}
                      className="text-gray-400 hover:text-amber-600 transition-colors"
                      title="Réinitialiser le mot de passe"
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      onClick={() => setEditTarget(user)}
                      className="text-gray-400 hover:text-gray-700 transition-colors"
                      title="Modifier"
                    >
                      <Edit size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalUser open={createOpen} onClose={() => setCreateOpen(false)} />
      <ModalUser open={editTarget !== null} onClose={() => setEditTarget(null)} initialData={editTarget ?? undefined} />
      {resetPwdTarget && (
        <ModalResetPassword
          open={resetPwdTarget !== null}
          onClose={() => setResetPwdTarget(null)}
          userId={resetPwdTarget.id}
          userName={resetPwdTarget.nom}
        />
      )}
    </div>
  )
}

// ─── Modal TORG / TENV ────────────────────────────────────────

const typeOrgEnvSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  cla_id: z.string().optional(),
  parent_id: z.string().optional(),
})
type TypeOrgEnvFormValues = z.infer<typeof typeOrgEnvSchema>

type TypeApi = typeof torgApi | typeof tenvApi
type TorgOrTenv = Torg | Tenv
type TorgOrTenvQueryKey = ['torg', 'tree'] | ['torg', 'list'] | ['tenv', 'tree'] | ['tenv', 'list']

interface ModalTypeOrgEnvProps {
  open: boolean
  onClose: () => void
  typeApi: TypeApi
  queryKeys: TorgOrTenvQueryKey[]
  initialData?: TorgOrTenv
  parentId?: number
  entityLabel: string
}

function ModalTypeOrgEnv({ open, onClose, typeApi, queryKeys, initialData, parentId, entityLabel }: ModalTypeOrgEnvProps) {
  const qc = useQueryClient()
  const { data: classes } = useClaList()

  const { data: flatList } = useQuery<TorgOrTenv[]>({
    queryKey: queryKeys.find((k) => k[1] === 'list') ?? queryKeys[0],
    queryFn: () => typeApi.list().then((r) => r.data),
    enabled: open,
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TypeOrgEnvFormValues>({
    resolver: zodResolver(typeOrgEnvSchema),
    defaultValues: { nom: '', cla_id: '', parent_id: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        nom: initialData?.nom ?? '',
        cla_id: initialData?.cla?.id != null ? String(initialData.cla.id) : '',
        parent_id: initialData?.parent_id != null
          ? String(initialData.parent_id)
          : parentId != null
          ? String(parentId)
          : '',
      })
    }
  }, [open, initialData, parentId, reset])

  const { mutate: save, isPending } = useMutation({
    mutationFn: (values: TypeOrgEnvFormValues) => {
      const payload = {
        nom: values.nom,
        cla_id: values.cla_id ? Number(values.cla_id) : undefined,
        parent_id: values.parent_id ? Number(values.parent_id) : undefined,
      }
      return initialData
        ? typeApi.update(initialData.id, payload)
        : typeApi.create(payload)
    },
    onSuccess: () => {
      queryKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
      onClose()
    },
  })

  const isSubNode = parentId != null && !initialData

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isSubNode ? `Ajouter un sous-type ${entityLabel}` : initialData ? `Modifier le type ${entityLabel}` : `Nouveau type ${entityLabel}`}
    >
      <form onSubmit={handleSubmit((d) => save(d))} className="space-y-4">
        <FormField label="Nom *" error={errors.nom?.message}>
          <input {...register('nom')} className={inputClass} />
        </FormField>
        <FormField label="Classe" error={errors.cla_id?.message} hint="Laissez vide pour créer automatiquement une classe du même nom">
          <select {...register('cla_id')} className={selectClass}>
            <option value="">— Créer automatiquement —</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Parent" error={errors.parent_id?.message}>
          <select {...register('parent_id')} className={selectClass}>
            <option value="">— Aucun (racine) —</option>
            {flatList?.filter((t) => t.id !== initialData?.id).map((t) => (
              <option key={t.id} value={t.id}>{t.nom}</option>
            ))}
          </select>
        </FormField>
        <SubmitRow pending={isPending || isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── Composant arbre type (TORG / TENV) ──────────────────────

interface TypeTreeNodeProps {
  node: Torg | Tenv
  openIds: Set<number>
  onToggle: (id: number) => void
  onAddChild: (node: TorgOrTenv) => void
  onEdit: (node: TorgOrTenv) => void
  onDelete: (node: TorgOrTenv) => void
  depth?: number
}

function TypeTreeNode({ node, openIds, onToggle, onAddChild, onEdit, onDelete, depth = 0 }: TypeTreeNodeProps) {
  const hasChildren = node.enfants && node.enfants.length > 0
  const isOpen = openIds.has(node.id)

  return (
    <div>
      <div
        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg group"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {hasChildren ? (
            <button
              className="shrink-0 text-gray-400 hover:text-gray-700"
              onClick={() => onToggle(node.id)}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-[14px] shrink-0" />
          )}
          <span className="text-sm text-gray-900 truncate">{node.nom}</span>
          <span className="text-xs text-gray-400">({node.cla.nom})</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onAddChild(node)}
            className="p-1 text-gray-400 hover:text-gray-700 rounded"
            title="Ajouter sous-nœud"
          >
            <Plus size={12} />
          </button>
          <button
            onClick={() => onEdit(node)}
            className="p-1 text-gray-400 hover:text-gray-700 rounded"
            title="Modifier"
          >
            <Edit size={12} />
          </button>
          <button
            onClick={() => onDelete(node)}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title="Supprimer"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.enfants!.map((child) => (
            <TypeTreeNode
              key={child.id}
              node={child as Torg | Tenv}
              openIds={openIds}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Onglet Types ORG ────────────────────────────────────────

function TabTypesOrg() {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [addChildTarget, setAddChildTarget] = useState<TorgOrTenv | null>(null)
  const [editTarget, setEditTarget] = useState<TorgOrTenv | null>(null)

  const qc = useQueryClient()
  const { data: tree, isLoading, isError } = useQuery<Torg[]>({
    queryKey: ['torg', 'tree'],
    queryFn: () => torgApi.tree().then((r) => r.data),
  })

  const { mutate: deleteNode } = useMutation({
    mutationFn: (id: number) => torgApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['torg', 'tree'] })
      qc.invalidateQueries({ queryKey: ['torg', 'list'] })
    },
  })

  function toggle(id: number) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const torgQueryKeys: TorgOrTenvQueryKey[] = [['torg', 'tree'], ['torg', 'list']]

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Chargement…</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Erreur de chargement.</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-gray-800">Types d'organisation</h3>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          Nouveau type
        </button>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-2">
        {tree?.map((node) => (
          <TypeTreeNode
            key={node.id}
            node={node}
            openIds={openIds}
            onToggle={toggle}
            onAddChild={(n) => setAddChildTarget(n)}
            onEdit={(n) => setEditTarget(n)}
            onDelete={(n) => { if (confirm(`Supprimer « ${n.nom} » ?`)) deleteNode(n.id) }}
          />
        ))}
        {tree?.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-sm">Aucun type défini.</p>
        )}
      </div>

      <ModalTypeOrgEnv
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        typeApi={torgApi}
        queryKeys={torgQueryKeys}
        entityLabel="ORG"
      />
      <ModalTypeOrgEnv
        open={addChildTarget !== null}
        onClose={() => setAddChildTarget(null)}
        typeApi={torgApi}
        queryKeys={torgQueryKeys}
        parentId={addChildTarget?.id}
        entityLabel="ORG"
      />
      <ModalTypeOrgEnv
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        typeApi={torgApi}
        queryKeys={torgQueryKeys}
        initialData={editTarget ?? undefined}
        entityLabel="ORG"
      />
    </div>
  )
}

// ─── Onglet Types ENV ────────────────────────────────────────

function TabTypesEnv() {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [addChildTarget, setAddChildTarget] = useState<TorgOrTenv | null>(null)
  const [editTarget, setEditTarget] = useState<TorgOrTenv | null>(null)

  const qc = useQueryClient()
  const { data: tree, isLoading, isError } = useQuery<Tenv[]>({
    queryKey: ['tenv', 'tree'],
    queryFn: () => tenvApi.tree().then((r) => r.data),
  })

  const { mutate: deleteNode } = useMutation({
    mutationFn: (id: number) => tenvApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenv', 'tree'] })
      qc.invalidateQueries({ queryKey: ['tenv', 'list'] })
    },
  })

  function toggle(id: number) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tenvQueryKeys: TorgOrTenvQueryKey[] = [['tenv', 'tree'], ['tenv', 'list']]

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Chargement…</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Erreur de chargement.</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-gray-800">Types d'environnement</h3>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} />
          Nouveau type
        </button>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-2">
        {tree?.map((node) => (
          <TypeTreeNode
            key={node.id}
            node={node}
            openIds={openIds}
            onToggle={toggle}
            onAddChild={(n) => setAddChildTarget(n)}
            onEdit={(n) => setEditTarget(n)}
            onDelete={(n) => { if (confirm(`Supprimer « ${n.nom} » ?`)) deleteNode(n.id) }}
          />
        ))}
        {tree?.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-sm">Aucun type défini.</p>
        )}
      </div>

      <ModalTypeOrgEnv
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        typeApi={tenvApi}
        queryKeys={tenvQueryKeys}
        entityLabel="ENV"
      />
      <ModalTypeOrgEnv
        open={addChildTarget !== null}
        onClose={() => setAddChildTarget(null)}
        typeApi={tenvApi}
        queryKeys={tenvQueryKeys}
        parentId={addChildTarget?.id}
        entityLabel="ENV"
      />
      <ModalTypeOrgEnv
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        typeApi={tenvApi}
        queryKeys={tenvQueryKeys}
        initialData={editTarget ?? undefined}
        entityLabel="ENV"
      />
    </div>
  )
}

// ─── Modal TENG ───────────────────────────────────────────────

const tengSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  cla_id: z.string().min(1, 'La classe est requise'),
})
type TengFormValues = z.infer<typeof tengSchema>

interface ModalTengProps {
  open: boolean
  onClose: () => void
  initialData?: Teng
}

function ModalTeng({ open, onClose, initialData }: ModalTengProps) {
  const qc = useQueryClient()
  const { data: classes } = useClaList()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TengFormValues>({
    resolver: zodResolver(tengSchema),
    defaultValues: { nom: '', cla_id: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        nom: initialData?.nom ?? '',
        cla_id: initialData?.cla?.id != null ? String(initialData.cla.id) : '',
      })
    }
  }, [open, initialData, reset])

  const { mutate: save, isPending } = useMutation({
    mutationFn: (values: TengFormValues) => {
      const payload = { nom: values.nom, cla_id: Number(values.cla_id) }
      return initialData
        ? tengApi.update(initialData.id, payload)
        : tengApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teng'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Modifier le type ENG' : 'Nouveau type ENG'}>
      <form onSubmit={handleSubmit((d) => save(d))} className="space-y-4">
        <FormField label="Nom *" error={errors.nom?.message}>
          <input {...register('nom')} className={inputClass} />
        </FormField>
        <FormField label="Classe *" error={errors.cla_id?.message}>
          <select {...register('cla_id')} className={selectClass}>
            <option value="">— Sélectionner —</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </FormField>
        <SubmitRow pending={isPending || isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── Modal TEVENT ─────────────────────────────────────────────

const teventSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  cla_id: z.string().min(1, 'La classe est requise'),
  duree_prevue_valeur: z.string().optional(),
  duree_prevue_unite: z.string().optional(),
})
type TeventFormValues = z.infer<typeof teventSchema>

interface ModalTeventProps {
  open: boolean
  onClose: () => void
  initialData?: Tevent
}

function ModalTevent({ open, onClose, initialData }: ModalTeventProps) {
  const qc = useQueryClient()
  const { data: classes } = useClaList()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TeventFormValues>({
    resolver: zodResolver(teventSchema),
    defaultValues: { nom: '', cla_id: '', duree_prevue_valeur: '', duree_prevue_unite: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        nom: initialData?.nom ?? '',
        cla_id: initialData?.cla?.id != null ? String(initialData.cla.id) : '',
        duree_prevue_valeur: initialData?.duree_prevue_valeur != null ? String(initialData.duree_prevue_valeur) : '',
        duree_prevue_unite: initialData?.duree_prevue_unite ?? '',
      })
    }
  }, [open, initialData, reset])

  const { mutate: save, isPending } = useMutation({
    mutationFn: (values: TeventFormValues) => {
      const payload: Record<string, unknown> = {
        nom: values.nom,
        cla_id: Number(values.cla_id),
        duree_prevue_valeur: values.duree_prevue_valeur ? Number(values.duree_prevue_valeur) : undefined,
        duree_prevue_unite: values.duree_prevue_unite || undefined,
      }
      return initialData
        ? teventApi.update(initialData.id, payload)
        : teventApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tevent'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={initialData ? 'Modifier le type EVENT' : 'Nouveau type EVENT'}>
      <form onSubmit={handleSubmit((d) => save(d))} className="space-y-4">
        <FormField label="Nom *" error={errors.nom?.message}>
          <input {...register('nom')} className={inputClass} />
        </FormField>
        <FormField label="Classe *" error={errors.cla_id?.message}>
          <select {...register('cla_id')} className={selectClass}>
            <option value="">— Sélectionner —</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Durée prévue (valeur)" error={errors.duree_prevue_valeur?.message}>
            <input {...register('duree_prevue_valeur')} type="number" min={0} className={inputClass} placeholder="ex: 2" />
          </FormField>
          <FormField label="Unité" error={errors.duree_prevue_unite?.message}>
            <select {...register('duree_prevue_unite')} className={selectClass}>
              <option value="">— Aucune —</option>
              <option value="secondes">Secondes</option>
              <option value="minutes">Minutes</option>
              <option value="heures">Heures</option>
              <option value="jours">Jours</option>
              <option value="mois">Mois</option>
            </select>
          </FormField>
        </div>
        <SubmitRow pending={isPending || isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── Template TEVENT d'un TENG ───────────────────────────────

interface TengTemplate {
  id: number
  teng_id: number
  tevent_id: number
  ordre: number
  tevent_nom: string
  tevent_duree_valeur: number | null
  tevent_duree_unite: string | null
}

function TemplatePanelRow({ tmpl, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  tmpl: TengTemplate
  onDelete: (id: number) => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const duree = tmpl.tevent_duree_valeur
    ? `${tmpl.tevent_duree_valeur} ${tmpl.tevent_duree_unite}`
    : '—'
  return (
    <div className="flex items-center gap-2 py-1.5 px-3 border-b border-gray-100 last:border-0">
      <div className="flex flex-col gap-0.5">
        <button disabled={isFirst} onClick={onMoveUp} className="text-gray-300 hover:text-gray-600 disabled:opacity-20">
          <ChevronRight size={12} className="-rotate-90" />
        </button>
        <button disabled={isLast} onClick={onMoveDown} className="text-gray-300 hover:text-gray-600 disabled:opacity-20">
          <ChevronRight size={12} className="rotate-90" />
        </button>
      </div>
      <span className="w-5 text-xs text-gray-400 text-center">{tmpl.ordre + 1}</span>
      <span className="flex-1 text-sm text-gray-900">{tmpl.tevent_nom}</span>
      <span className="text-xs text-gray-400">{duree}</span>
      <button onClick={() => onDelete(tmpl.id)} className="text-gray-300 hover:text-red-500 ml-2">
        <X size={13} />
      </button>
    </div>
  )
}

function TemplatePanel({ teng, tevents }: { teng: Teng; tevents: Tevent[] | undefined }) {
  const qc = useQueryClient()
  const [addTeventId, setAddTeventId] = useState<string>('')

  const { data: templates = [] } = useQuery<TengTemplate[]>({
    queryKey: ['teng', teng.id, 'templates'],
    queryFn: () => tengApi.listTemplates(teng.id).then((r) => r.data),
  })

  const addMutation = useMutation({
    mutationFn: (teventId: number) => tengApi.addTemplate(teng.id, teventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teng', teng.id, 'templates'] })
      setAddTeventId('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (templateId: number) => tengApi.deleteTemplate(teng.id, templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teng', teng.id, 'templates'] }),
  })

  const reorderMutation = useMutation({
    mutationFn: (ordre: number[]) => tengApi.reorderTemplates(teng.id, ordre),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teng', teng.id, 'templates'] }),
  })

  const move = (index: number, dir: -1 | 1) => {
    const ids = templates.map((t) => t.id)
    const swapped = [...ids]
    ;[swapped[index], swapped[index + dir]] = [swapped[index + dir], swapped[index]]
    reorderMutation.mutate(swapped)
  }

  return (
    <div className="mt-2 ml-6 bg-gray-50 rounded-lg border border-gray-200">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          EVENTs automatiques ({templates.length})
        </span>
        <div className="flex items-center gap-2">
          <select
            value={addTeventId}
            onChange={(e) => setAddTeventId(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
          >
            <option value="">+ Ajouter un TEVENT…</option>
            {tevents?.map((t) => (
              <option key={t.id} value={t.id}>{t.nom}</option>
            ))}
          </select>
          {addTeventId && (
            <button
              onClick={() => addMutation.mutate(Number(addTeventId))}
              disabled={addMutation.isPending}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Ajouter
            </button>
          )}
        </div>
      </div>
      {templates.length === 0 ? (
        <p className="text-xs text-gray-400 px-3 py-3 text-center">Aucun EVENT automatique défini.</p>
      ) : (
        <div>
          {templates.map((tmpl, i) => (
            <TemplatePanelRow
              key={tmpl.id}
              tmpl={tmpl}
              onDelete={(id) => deleteMutation.mutate(id)}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              isFirst={i === 0}
              isLast={i === templates.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Onglet Types ENG / EVENT ────────────────────────────────

function TabTypesEngEvent() {
  const [tengCreateOpen, setTengCreateOpen] = useState(false)
  const [tengEditTarget, setTengEditTarget] = useState<Teng | null>(null)
  const [teventCreateOpen, setTeventCreateOpen] = useState(false)
  const [teventEditTarget, setTeventEditTarget] = useState<Tevent | null>(null)
  const [expandedTengId, setExpandedTengId] = useState<number | null>(null)

  const { data: tengs, isLoading: tengLoading } = useQuery<Teng[]>({
    queryKey: ['teng', 'list'],
    queryFn: () => tengApi.list().then((r) => r.data),
  })

  const qc = useQueryClient()
  const { data: tevents, isLoading: teventLoading } = useQuery<Tevent[]>({
    queryKey: ['tevent', 'list'],
    queryFn: () => teventApi.list().then((r) => r.data),
  })

  const { mutate: deleteTeng } = useMutation({
    mutationFn: (id: number) => tengApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teng'] }),
  })

  const { mutate: deleteTevent } = useMutation({
    mutationFn: (id: number) => teventApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tevent'] }),
  })

  return (
    <div className="space-y-6">
      {/* Types ENG */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-gray-800">Types d'engagement</h3>
          <button
            onClick={() => setTengCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Nouveau type
          </button>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {tengLoading ? (
            <p className="text-gray-400 py-6 text-sm text-center">Chargement…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Nom</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Classe</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {tengs?.map((t) => (
                  <>
                    <tr key={t.id} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        <button
                          onClick={() => setExpandedTengId(expandedTengId === t.id ? null : t.id)}
                          className="flex items-center gap-1.5 hover:text-sky-700 transition-colors"
                        >
                          <ChevronRight size={13} className={cn('transition-transform', expandedTengId === t.id && 'rotate-90')} />
                          {t.nom}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{t.cla.nom}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => setTengEditTarget(t)} className="text-gray-400 hover:text-gray-700"><Edit size={14} /></button>
                          <button
                            onClick={() => { if (confirm(`Supprimer « ${t.nom} » ?`)) deleteTeng(t.id) }}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedTengId === t.id && (
                      <tr key={`${t.id}-tmpl`} className="bg-gray-50">
                        <td colSpan={3} className="px-4 pb-3">
                          <TemplatePanel teng={t} tevents={tevents} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {tengs?.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-sm">Aucun type défini.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Types EVENT */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-gray-800">Types d'évènement</h3>
          <button
            onClick={() => setTeventCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Nouveau type
          </button>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {teventLoading ? (
            <p className="text-gray-400 py-6 text-sm text-center">Chargement…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Nom</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Classe</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Durée prévue</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {tevents?.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{t.nom}</td>
                    <td className="px-4 py-2.5 text-gray-500">{t.cla.nom}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {t.duree_prevue_valeur != null
                        ? `${t.duree_prevue_valeur} ${t.duree_prevue_unite}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setTeventEditTarget(t)} className="text-gray-400 hover:text-gray-700"><Edit size={14} /></button>
                        <button
                          onClick={() => { if (confirm(`Supprimer « ${t.nom} » ?`)) deleteTevent(t.id) }}
                          className="text-gray-400 hover:text-red-500"
                        ><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {tevents?.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">Aucun type défini.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ModalTeng open={tengCreateOpen} onClose={() => setTengCreateOpen(false)} />
      <ModalTeng open={tengEditTarget !== null} onClose={() => setTengEditTarget(null)} initialData={tengEditTarget ?? undefined} />
      <ModalTevent open={teventCreateOpen} onClose={() => setTeventCreateOpen(false)} />
      <ModalTevent open={teventEditTarget !== null} onClose={() => setTeventEditTarget(null)} initialData={teventEditTarget ?? undefined} />
    </div>
  )
}

// ─── Modal LLM ────────────────────────────────────────────────

const llmCreateSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  fournisseur: z.string().min(1, 'Le fournisseur est requis'),
  modele: z.string().min(1, 'Le modèle est requis'),
  api_key: z.string().min(1, 'La clé API est requise'),
  api_url: z.string().optional(),
})
const llmEditSchema = llmCreateSchema.extend({
  api_key: z.string().optional(),
})

type LlmEditFormValues = z.infer<typeof llmEditSchema>

interface ModalLlmProps {
  open: boolean
  onClose: () => void
  initialData?: LlmDistant
}

function ModalLlm({ open, onClose, initialData }: ModalLlmProps) {
  const qc = useQueryClient()
  const isEdit = initialData != null

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<LlmEditFormValues>({
    resolver: zodResolver(isEdit ? llmEditSchema : llmCreateSchema),
    defaultValues: { nom: '', fournisseur: '', modele: '', api_key: '', api_url: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        nom: initialData?.nom ?? '',
        fournisseur: initialData?.fournisseur ?? '',
        modele: (initialData as LlmDistant & { modele?: string })?.modele ?? '',
        api_key: '',
        api_url: (initialData as LlmDistant & { api_url?: string })?.api_url ?? '',
      })
    }
  }, [open, initialData, reset])

  const { mutate: save, isPending } = useMutation({
    mutationFn: (values: LlmEditFormValues) => {
      const payload: Record<string, unknown> = {
        nom: values.nom,
        fournisseur: values.fournisseur,
        modele: values.modele,
        api_url: values.api_url || undefined,
      }
      if (values.api_key) payload.api_key = values.api_key
      return isEdit
        ? configApi.updateLlm(initialData!.id, payload)
        : configApi.createLlm(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config', 'llms'] })
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier le LLM' : 'Ajouter un LLM distant'}>
      <form onSubmit={handleSubmit((d) => save(d))} className="space-y-4">
        <FormField label="Nom *" error={errors.nom?.message}>
          <input {...register('nom')} className={inputClass} placeholder="ex: Claude Opus 4" />
        </FormField>
        <FormField label="Fournisseur *" error={errors.fournisseur?.message}>
          <input {...register('fournisseur')} className={inputClass} placeholder="ex: Anthropic, OpenAI…" />
        </FormField>
        <FormField label="Modèle *" error={errors.modele?.message}>
          <input {...register('modele')} className={inputClass} placeholder="ex: claude-opus-4-5" />
        </FormField>
        <FormField
          label={isEdit ? 'Clé API (laisser vide pour ne pas modifier)' : 'Clé API *'}
          error={errors.api_key?.message}
        >
          <input {...register('api_key')} type="password" className={inputClass} autoComplete="new-password" />
        </FormField>
        <FormField label="URL API (optionnel)" error={errors.api_url?.message}>
          <input {...register('api_url')} className={inputClass} placeholder="ex: https://api.anthropic.com" />
        </FormField>
        <SubmitRow pending={isPending || isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── Onglet Configuration ────────────────────────────────────

interface ConfigFormValues {
  obsidian_vault_path: string
  ollama_url: string
  ollama_modele: string
  oidc_enabled: boolean
  oidc_issuer_url: string
  oidc_client_id: string
  oidc_client_secret: string
  oidc_scopes: string
  oidc_allow_local_login: boolean
}

function TabConfig() {
  const qc = useQueryClient()
  const [llmCreateOpen, setLlmCreateOpen] = useState(false)
  const [llmEditTarget, setLlmEditTarget] = useState<LlmDistant | null>(null)

  const { data: config, isLoading } = useQuery<AppConfig>({
    queryKey: ['config'],
    queryFn: () => configApi.get().then((r) => r.data),
  })

  const { data: llms, isLoading: llmsLoading } = useQuery<LlmDistant[]>({
    queryKey: ['config', 'llms'],
    queryFn: () => configApi.listLlm().then((r) => r.data),
  })

  const { register, handleSubmit, reset, watch, formState: { isDirty, isSubmitting } } = useForm<ConfigFormValues>({
    defaultValues: {
      obsidian_vault_path: '', ollama_url: '', ollama_modele: '',
      oidc_enabled: false, oidc_issuer_url: '', oidc_client_id: '',
      oidc_client_secret: '', oidc_scopes: 'openid email profile',
      oidc_allow_local_login: true,
    },
  })

  const oidcEnabled = watch('oidc_enabled')

  useEffect(() => {
    if (config) {
      reset({
        obsidian_vault_path: config.obsidian_vault_path ?? '',
        ollama_url: config.ollama_url ?? '',
        ollama_modele: config.ollama_modele ?? '',
        oidc_enabled: config.oidc_enabled ?? false,
        oidc_issuer_url: config.oidc_issuer_url ?? '',
        oidc_client_id: config.oidc_client_id ?? '',
        oidc_client_secret: '',
        oidc_scopes: config.oidc_scopes ?? 'openid email profile',
        oidc_allow_local_login: config.oidc_allow_local_login ?? true,
      })
    }
  }, [config, reset])

  const { mutate: updateConfig, isPending } = useMutation({
    mutationFn: (data: ConfigFormValues) => {
      // N'envoyer oidc_client_secret que s'il est renseigné
      const payload: Record<string, unknown> = { ...data }
      if (!payload.oidc_client_secret) delete payload.oidc_client_secret
      return configApi.update(payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })

  const { mutate: deleteLlm } = useMutation({
    mutationFn: (id: number) => configApi.deleteLlm(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', 'llms'] }),
  })

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Chargement…</div>

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Formulaire config globale */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 mb-4">Configuration globale</h3>
        <form onSubmit={handleSubmit((d) => updateConfig(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chemin Vault Obsidian
            </label>
            <input
              {...register('obsidian_vault_path')}
              type="text"
              placeholder="/Users/you/Documents/Obsidian/Vault"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Ollama
            </label>
            <input
              {...register('ollama_url')}
              type="text"
              placeholder="http://localhost:11434"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Modèle Ollama
            </label>
            <input
              {...register('ollama_modele')}
              type="text"
              placeholder="llama3"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {/* ── Section OIDC ── */}
          <div className="border-t border-gray-100 pt-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-800">Authentification SSO (OIDC)</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('oidc_enabled')} className="accent-blue-600" />
                <span className="text-sm text-gray-600">Activer</span>
              </label>
            </div>
            {oidcEnabled && (
              <div className="space-y-3 pl-1">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL Issuer OIDC</label>
                  <input
                    {...register('oidc_issuer_url')}
                    type="url"
                    placeholder="https://accounts.google.com"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Base URL du provider — la découverte se fait via <code>{'/.well-known/openid-configuration'}</code></p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                  <input
                    {...register('oidc_client_id')}
                    type="text"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                  <input
                    {...register('oidc_client_secret')}
                    type="password"
                    placeholder="Laisser vide pour conserver l'existant"
                    autoComplete="new-password"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scopes</label>
                  <input
                    {...register('oidc_scopes')}
                    type="text"
                    placeholder="openid email profile"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register('oidc_allow_local_login')} className="accent-blue-600" />
                  <span className="text-sm text-gray-700">Conserver la connexion locale (identifiant + mot de passe) en parallèle du SSO</span>
                </label>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!isDirty || isPending || isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>

      {/* LLM distants */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-gray-800">LLM distants</h3>
          <button
            onClick={() => setLlmCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Ajouter
          </button>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {llmsLoading ? (
            <p className="text-gray-400 py-6 text-sm text-center">Chargement…</p>
          ) : llms && llms.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Nom</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Fournisseur</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {llms.map((llm) => (
                  <tr key={llm.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{llm.nom}</td>
                    <td className="px-4 py-2.5 text-gray-500">{llm.fournisseur}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setLlmEditTarget(llm)} className="text-gray-400 hover:text-gray-700"><Edit size={14} /></button>
                        <button
                          onClick={() => { if (confirm(`Supprimer « ${llm.nom} » ?`)) deleteLlm(llm.id) }}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-center text-gray-400 py-6 text-sm">Aucun LLM distant configuré.</p>
          )}
        </div>
      </div>

      <ModalLlm open={llmCreateOpen} onClose={() => setLlmCreateOpen(false)} />
      <ModalLlm open={llmEditTarget !== null} onClose={() => setLlmEditTarget(null)} initialData={llmEditTarget ?? undefined} />

      {/* Meilisearch — réindexation */}
      <ReindexSection />
    </div>
  )
}

// ─── Section réindexation Meilisearch ────────────────────────

function ReindexSection() {
  const [result, setResult] = useState<{ reindexed: number } | null>(null)
  const { mutate: reindex, isPending } = useMutation({
    mutationFn: () => searchApi.reindex().then((r) => r.data as { reindexed: number }),
    onSuccess: (data) => setResult(data),
    onError: () => toast.error('Erreur lors de la réindexation'),
  })

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-800 mb-2">Recherche full-text (Meilisearch)</h3>
      <p className="text-sm text-gray-500 mb-3">
        Ré-indexe toutes les entités (ORG, ENV, ENG, EVENT) dans Meilisearch.
        À utiliser après une migration ou une importation de données.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => reindex()}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition-colors"
        >
          {isPending ? <><Loader2 size={14} className="animate-spin" /> Réindexation…</> : 'Réindexer tout'}
        </button>
        {result && (
          <span className="text-sm text-green-700 font-medium">
            ✓ {result.reindexed} entité{result.reindexed !== 1 ? 's' : ''} réindexée{result.reindexed !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Onglet Journal ──────────────────────────────────────────

function TabLog() {
  const [page, setPage] = useState(1)
  const [filterTable, setFilterTable] = useState('')
  const [filterOp, setFilterOp] = useState('')

  const { data, isLoading, isError } = useQuery<PaginatedLog>({
    queryKey: ['log', page, filterTable, filterOp],
    queryFn: () =>
      logApi.list({
        table_name: filterTable || undefined,
        operation: filterOp || undefined,
        page,
      }).then((r) => r.data),
  })

  const totalPages = data ? Math.ceil(data.total / data.per_page) : 1

  return (
    <div>
      {/* Filtres */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={filterTable}
          onChange={(e) => { setFilterTable(e.target.value); setPage(1) }}
          placeholder="Filtrer par table…"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 w-44"
        />
        <select
          value={filterOp}
          onChange={(e) => { setFilterOp(e.target.value); setPage(1) }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Toutes opérations</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>

      {isLoading && <div className="text-gray-400 py-8 text-center">Chargement…</div>}
      {isError && <div className="text-red-500 py-8 text-center">Erreur de chargement.</div>}

      {data && (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Table</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Opération</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">ID objet</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Utilisateur</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id} className="border-t border-gray-100">
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                      {formatDateTime(entry.horodatage)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{entry.table_name}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                          entry.operation === 'INSERT'
                            ? 'bg-green-100 text-green-700'
                            : entry.operation === 'UPDATE'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700',
                        )}
                      >
                        {entry.operation}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{entry.entite_id ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {entry.user_nom ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                Précédent
              </button>
              <span className="text-sm text-gray-500">Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Onglet Statistiques ─────────────────────────────────────

interface StatsData {
  nb_orgs: number
  nb_envs: number
  nb_engs: number
  nb_events: number
  nb_users: number
  nb_events_retard: number
  nb_events_accomplis: number
  nb_engs_termines: number
  nb_engs_en_cours: number
  nb_engs_non_demarres: number
  nb_recents_7j: number
}

function StatCard({ icon, label, value, color = 'text-gray-900', bg = 'bg-white' }: {
  icon: React.ReactNode
  label: string
  value: number
  color?: string
  bg?: string
}) {
  return (
    <div className={`${bg} border border-gray-200 rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-1 text-gray-500">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString('fr-FR')}</p>
    </div>
  )
}

function TabStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => statsApi.get().then((r) => r.data as StatsData),
  })

  if (isLoading) return <div className="text-center text-gray-400 py-16">Chargement…</div>
  if (!data) return null

  const pctAccomplis = data.nb_events > 0
    ? Math.round((data.nb_events_accomplis / data.nb_events) * 100)
    : 0

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Entités</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard icon={<Building2 size={14} />}    label="Organisations"  value={data.nb_orgs} />
          <StatCard icon={<Globe size={14} />}          label="Environnements" value={data.nb_envs} />
          <StatCard icon={<Handshake size={14} />}     label="Engagements"    value={data.nb_engs} />
          <StatCard icon={<CalendarClock size={14} />} label="Événements"     value={data.nb_events} />
          <StatCard icon={<Users size={14} />}         label="Utilisateurs"   value={data.nb_users} />
          <StatCard icon={<Activity size={14} />}      label="Modifiés (7j)"  value={data.nb_recents_7j} bg="bg-blue-50" color="text-blue-700" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Engagements par statut</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<CheckCircle2 size={14} className="text-green-500" />} label="Terminés"      value={data.nb_engs_termines}     bg="bg-green-50" color="text-green-700" />
          <StatCard icon={<Clock size={14} className="text-amber-500" />}        label="En cours"      value={data.nb_engs_en_cours}      bg="bg-amber-50" color="text-amber-700" />
          <StatCard icon={<BarChart3 size={14} className="text-gray-400" />}     label="Non démarrés"  value={data.nb_engs_non_demarres} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Événements</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<CheckCircle2 size={14} className="text-green-500" />} label="Accomplis"  value={data.nb_events_accomplis} bg="bg-green-50" color="text-green-700" />
          <StatCard icon={<AlertTriangle size={14} className="text-red-500" />}  label="En retard"  value={data.nb_events_retard}    bg="bg-red-50"   color="text-red-700" />
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1 text-gray-500">
              <BarChart3 size={14} />
              <span className="text-xs font-medium">Taux d'accomplissement</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{pctAccomplis} %</p>
            <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-green-400 transition-all" style={{ width: `${pctAccomplis}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Définition des onglets ──────────────────────────────────

type TabId = 'stats' | 'classes' | 'users' | 'types-org' | 'types-env' | 'types-eng' | 'config' | 'log'

interface TabDef {
  id: TabId
  label: string
}

const TABS: TabDef[] = [
  { id: 'stats',     label: 'Statistiques' },
  { id: 'classes',   label: 'Classes (CLA)' },
  { id: 'users',     label: 'Utilisateurs' },
  { id: 'types-org', label: 'Types ORG' },
  { id: 'types-env', label: 'Types ENV' },
  { id: 'types-eng', label: 'Types ENG/EVENT' },
  { id: 'config',    label: 'Configuration' },
  { id: 'log',       label: 'Journal (LOG)' },
]

// ─── Page principale ─────────────────────────────────────────

export default function AdminPage() {
  const navigate = useNavigate()
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const [activeTab, setActiveTab] = useState<TabId>('stats')

  // Redirection si non-admin
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/panel', { replace: true })
    }
  }, [isAdmin, navigate])

  if (!isAdmin()) return null

  return (
    <div className="flex h-full">
      {/* ─── Sidebar onglets ──────────────────── */}
      <aside className="w-52 border-r border-gray-200 bg-white shrink-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-gray-100">
          <h1 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Administration
          </h1>
        </div>
        <nav className="p-2 space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ─── Contenu de l'onglet actif ────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'stats'     && <TabStats />}
        {activeTab === 'classes'   && <TabClasses />}
        {activeTab === 'users'     && <TabUsers />}
        {activeTab === 'types-org' && <TabTypesOrg />}
        {activeTab === 'types-env' && <TabTypesEnv />}
        {activeTab === 'types-eng' && <TabTypesEngEvent />}
        {activeTab === 'config'    && <TabConfig />}
        {activeTab === 'log'       && <TabLog />}
      </div>
    </div>
  )
}
