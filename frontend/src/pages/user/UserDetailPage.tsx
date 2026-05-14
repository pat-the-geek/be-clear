import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { User, ExternalLink, Building2, KeyRound, ShieldCheck, Loader2, AlertCircle } from 'lucide-react'
import { userApi, logApi } from '@/services/api'
import { cn, formatDateTime } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'

// ─── Types ────────────────────────────────────────────────

interface TuserRef   { id: number; valeur: string }
interface RoleRef    { id: number; valeur: string }
interface UserDetail {
  id: number
  nom: string
  tuser: TuserRef
  role: RoleRef | null
  org_id: number | null
  org_nom: string | null
  est_actif: boolean
  auth_uid: string | null
}

interface LogEntry {
  id: number
  horodatage: string
  user_nom: string | null
  operation: string
  table_name: string
  entite_id: number | null
  avant: Record<string, unknown> | null
  apres: Record<string, unknown> | null
}

// ─── Helpers ──────────────────────────────────────────────

const ROLE_CLASS: Record<string, string> = {
  ADMIN:    'bg-red-100   text-red-700',
  EDITEUR:  'bg-blue-100  text-blue-700',
  LECTEUR:  'bg-gray-100  text-gray-600',
}

const OP_CLASS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700 border-green-200',
  UPDATE: 'bg-blue-100  text-blue-700  border-blue-200',
  DELETE: 'bg-red-100   text-red-700   border-red-200',
}
const OP_DOT: Record<string, string> = {
  INSERT: 'bg-green-400',
  UPDATE: 'bg-blue-400',
  DELETE: 'bg-red-400',
}
const OP_LABEL: Record<string, string> = {
  INSERT: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
}

// ─── Composant section ────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </h2>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const userId = Number(id)

  const { data: user, isLoading, isError } = useQuery<UserDetail>({
    queryKey: ['user', userId],
    queryFn: () => userApi.get(userId).then(r => r.data),
    enabled: !isNaN(userId),
  })

  // Historique des modifications du profil utilisateur
  const { data: profileLog } = useQuery({
    queryKey: ['log', 'user', userId],
    queryFn: () => logApi.list({ table_name: 'user', entite_id: userId, per_page: 50 }).then(r => r.data),
    enabled: !isNaN(userId),
  })

  // Actions effectuées par cet utilisateur (tous types d'entités)
  const { data: actionsLog } = useQuery({
    queryKey: ['log', 'by-user', userId],
    queryFn: () => logApi.list({ user_id: userId, per_page: 50 }).then(r => r.data),
    enabled: !isNaN(userId),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="flex items-center gap-2 text-red-600 p-8">
        <AlertCircle size={18} />
        <span className="text-sm">Utilisateur introuvable.</span>
      </div>
    )
  }

  const profileEntries: LogEntry[] = profileLog?.items ?? []
  const actionEntries: LogEntry[] = actionsLog?.items ?? []

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">

      {/* ── Header ── */}
      <PageHeader
        title={user.nom}
        subtitle={user.auth_uid ?? undefined}
        backTo="/admin"
      />

      {/* ── Avatar + badges ── */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
          <User size={26} className="text-gray-400" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">
            {user.tuser.valeur}
          </span>
          {user.role && (
            <span className={cn('text-sm px-2.5 py-0.5 rounded-full font-medium', ROLE_CLASS[user.role.valeur] ?? 'bg-gray-100 text-gray-600')}>
              {user.role.valeur}
            </span>
          )}
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full border font-medium',
            user.est_actif
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-200',
          )}>
            {user.est_actif ? 'Actif' : 'Inactif'}
          </span>
        </div>
      </div>

      {/* ── Fiche ── */}
      <div>
        <SectionTitle>Identité</SectionTitle>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">

          {user.auth_uid && (
            <Row icon={<KeyRound size={14} className="text-gray-400" />} label="Identifiant technique">
              <code className="font-mono text-xs text-gray-700 bg-gray-50 px-2 py-0.5 rounded">
                {user.auth_uid}
              </code>
            </Row>
          )}

          <Row icon={<ShieldCheck size={14} className="text-gray-400" />} label="Rôle">
            {user.role
              ? <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_CLASS[user.role.valeur] ?? 'bg-gray-100 text-gray-600')}>{user.role.valeur}</span>
              : <span className="text-gray-400 text-sm">—</span>
            }
          </Row>

          <Row icon={<Building2 size={14} className="text-gray-400" />} label="Organisation">
            {user.org_id
              ? (
                <Link to={`/org/${user.org_id}`} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  {user.org_nom ?? `ORG #${user.org_id}`}
                  <ExternalLink size={12} />
                </Link>
              )
              : <span className="text-gray-400 text-sm">—</span>
            }
          </Row>

        </div>
      </div>

      {/* ── Historique du profil ── */}
      <div>
        <SectionTitle>Historique du profil</SectionTitle>
        <LogSection entries={profileEntries} empty="Aucune modification enregistrée." />
      </div>

      {/* ── Actions effectuées ── */}
      <div>
        <SectionTitle>Actions récentes effectuées</SectionTitle>
        <LogSection entries={actionEntries} showEntity empty="Aucune action enregistrée." />
      </div>

    </div>
  )
}

// ─── Sous-composants ──────────────────────────────────────

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-xs text-gray-500 w-36 flex-shrink-0">{label}</span>
      <span>{children}</span>
    </div>
  )
}

function LogSection({ entries, empty, showEntity = false }: {
  entries: LogEntry[]
  empty: string
  showEntity?: boolean
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 italic">{empty}</p>
  }
  return (
    <div className="relative border-l-2 border-gray-100 ml-2 space-y-4">
      {entries.map(entry => (
        <div key={entry.id} className="relative pl-5">
          <span className={cn('absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white', OP_DOT[entry.operation] ?? 'bg-gray-400')} />
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className={cn('text-xs px-1.5 py-0.5 rounded border font-medium', OP_CLASS[entry.operation] ?? 'bg-gray-100 text-gray-600 border-gray-200')}>
              {OP_LABEL[entry.operation] ?? entry.operation}
            </span>
            {showEntity && (
              <span className="text-xs text-gray-500 font-mono">
                {entry.table_name}{entry.entite_id ? ` #${entry.entite_id}` : ''}
              </span>
            )}
            <span className="text-xs text-gray-400">{formatDateTime(entry.horodatage)}</span>
            {entry.user_nom && !showEntity && (
              <span className="text-xs text-gray-400">par {entry.user_nom}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
