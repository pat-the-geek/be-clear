import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, CalendarDays, Loader2, AlertCircle, Lock } from 'lucide-react'
import { configApi, orgApi, authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime } from '@/lib/utils'
import type { Org } from '@/types'

// ─── Types ────────────────────────────────────────────────

interface ApiToken {
  id: number
  nom?: string
  expire_at?: string
  est_actif: boolean
  derniere_utilisation?: string
}

interface ApiTokenCreated extends ApiToken {
  token: string
}

// ─── Schéma création token ────────────────────────────────

const tokenSchema = z.object({
  nom: z.string().optional(),
  expire_at: z.string().optional(),
})
type TokenForm = z.infer<typeof tokenSchema>

// ─── Composant : carte token ──────────────────────────────

function TokenCard({
  token,
  onDelete,
}: {
  token: ApiToken
  onDelete: (id: number) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl">
      <div className="flex items-center gap-3 min-w-0">
        <Key size={14} className="text-gray-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">
            {token.nom ?? <span className="text-gray-400 font-normal">Sans nom</span>}
          </p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {token.expire_at ? (
              <span className="text-xs text-gray-500">Expire le {formatDateTime(token.expire_at)}</span>
            ) : (
              <span className="text-xs text-gray-400">Pas d'expiration</span>
            )}
            {token.derniere_utilisation && (
              <span className="text-xs text-gray-400">
                Utilisé le {formatDateTime(token.derniere_utilisation)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${token.est_actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {token.est_actif ? 'Actif' : 'Inactif'}
        </span>
        {confirmDelete ? (
          <>
            <button
              onClick={() => onDelete(token.id)}
              className="text-xs text-red-600 font-medium hover:text-red-800"
            >
              Confirmer
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Annuler
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
            title="Supprimer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Composant : token révélé après création ──────────────

function NewTokenBanner({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState(false)

  function copy() {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <div className="flex items-start gap-2 mb-3">
        <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm font-medium text-amber-800">
          Token généré — copiez-le maintenant, il ne sera plus affiché.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs font-mono bg-white border border-amber-200 rounded-lg px-3 py-2 text-gray-800 break-all">
          {visible ? token : '•'.repeat(Math.min(token.length, 48))}
        </code>
        <button
          onClick={() => setVisible((v) => !v)}
          className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-amber-100 transition-colors shrink-0"
          title={visible ? 'Masquer' : 'Révéler'}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button
          onClick={copy}
          className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-amber-100 transition-colors shrink-0"
          title="Copier"
        >
          {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
        </button>
      </div>
      <div className="flex justify-end mt-3">
        <button
          onClick={onDismiss}
          className="text-xs text-amber-700 hover:text-amber-900 font-medium"
        >
          J'ai copié le token ✓
        </button>
      </div>
    </div>
  )
}

// ─── Schéma changement de mot de passe ───────────────────

const changePwdSchema = z.object({
  current_password: z.string().min(1, 'Requis'),
  new_password: z.string().min(6, 'Au moins 6 caractères'),
  confirm_password: z.string().min(1, 'Requis'),
}).refine((d) => d.new_password === d.confirm_password, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirm_password'],
})
type ChangePwdForm = z.infer<typeof changePwdSchema>


// ─── Page principale ──────────────────────────────────────

export default function ProfilePage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null)

  const [showChangePwd, setShowChangePwd] = useState(false)
  const [changePwdSuccess, setChangePwdSuccess] = useState(false)

  const pwdForm = useForm<ChangePwdForm>({
    resolver: zodResolver(changePwdSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const changePwdMutation = useMutation({
    mutationFn: (data: ChangePwdForm) =>
      authApi.changePassword(data.current_password, data.new_password),
    onSuccess: () => {
      setChangePwdSuccess(true)
      setShowChangePwd(false)
      pwdForm.reset()
      setTimeout(() => setChangePwdSuccess(false), 4000)
    },
  })

  const { data: tokens, isLoading: loadingTokens } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => configApi.listTokens().then((r) => r.data as ApiToken[]),
  })

  const { data: org } = useQuery({
    queryKey: ['org', user?.org_id],
    queryFn: () => orgApi.get(user!.org_id!).then((r) => r.data as Org),
    enabled: user?.org_id != null,
  })

  const form = useForm<TokenForm>({
    resolver: zodResolver(tokenSchema),
    defaultValues: { nom: '', expire_at: '' },
  })

  const createMutation = useMutation({
    mutationFn: (data: TokenForm) =>
      configApi.createToken({ nom: data.nom || undefined, expire_at: data.expire_at || undefined })
        .then((r) => r.data as ApiTokenCreated),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
      setNewTokenValue(data.token)
      setShowCreateForm(false)
      form.reset({ nom: '', expire_at: '' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => configApi.deleteToken(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
  })

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Mon profil</h1>

      {/* ─── Carte identité ────────────────────────────────── */}
      <section className="mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-bold">
              {user?.obj?.nom?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">{user?.obj?.nom}</p>
              <p className="text-sm text-gray-500">{user?.role ?? '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
            {org && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Organisation</p>
                <p className="text-sm text-gray-800 font-medium">{org.obj.nom}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Statut</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user?.est_actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {user?.est_actif ? 'Actif' : 'Inactif'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Tokens API ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Clés API</h2>
            <p className="text-xs text-gray-500 mt-0.5">Utilisées pour accéder à l'API REST depuis des scripts ou applications externes.</p>
          </div>
          {!showCreateForm && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              Nouveau token
            </button>
          )}
        </div>

        {/* Formulaire création */}
        {showCreateForm && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-800 mb-3">Nouveau token</h3>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nom <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <input {...form.register('nom')} className={inputClass} placeholder="ex: Script de synchronisation" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Date d'expiration <span className="text-gray-400 font-normal">(optionnel)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="datetime-local" {...form.register('expire_at')} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {form.watch('expire_at') && (
                    <button
                      type="button"
                      onClick={() => form.setValue('expire_at', '')}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {createMutation.isError && (
                <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  Erreur lors de la création du token.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreateForm(false); form.reset() }}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending && <Loader2 size={13} className="animate-spin" />}
                  Générer
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bannière token généré */}
        {newTokenValue && (
          <NewTokenBanner
            token={newTokenValue}
            onDismiss={() => setNewTokenValue(null)}
          />
        )}

        {/* Liste des tokens */}
        <div className="space-y-2 mt-4">
          {loadingTokens && (
            <div className="text-center py-6 text-gray-400 text-sm">Chargement…</div>
          )}
          {!loadingTokens && (tokens ?? []).length === 0 && (
            <div className="text-center py-8 bg-white border border-dashed border-gray-200 rounded-xl">
              <Key size={24} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Aucun token API créé</p>
            </div>
          )}
          {(tokens ?? []).map((t) => (
            <TokenCard
              key={t.id}
              token={t}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>

        {/* Info usage */}
        {(tokens ?? []).length > 0 && (
          <div className="mt-4 p-3 bg-gray-50 border border-gray-100 rounded-xl">
            <p className="text-xs text-gray-500">
              Utilisez votre token dans l'en-tête HTTP :{' '}
              <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                Authorization: Bearer &lt;token&gt;
              </code>
            </p>
          </div>
        )}
      </section>

      {/* ─── Changer le mot de passe ────────────────────────── */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Mot de passe</h2>
          </div>
          {!showChangePwd && (
            <button
              onClick={() => { setShowChangePwd(true); setChangePwdSuccess(false) }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              Modifier
            </button>
          )}
        </div>

        {changePwdSuccess && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 mb-4">
            <Check size={14} className="shrink-0" />
            Mot de passe mis à jour avec succès.
          </div>
        )}

        {showChangePwd && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <form onSubmit={pwdForm.handleSubmit((d) => changePwdMutation.mutate(d))} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe actuel *</label>
                <input
                  {...pwdForm.register('current_password')}
                  type="password"
                  className={inputClass}
                  autoComplete="current-password"
                  autoFocus
                />
                {pwdForm.formState.errors.current_password && (
                  <p className="mt-1 text-xs text-red-500">{pwdForm.formState.errors.current_password.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nouveau mot de passe *</label>
                <input
                  {...pwdForm.register('new_password')}
                  type="password"
                  className={inputClass}
                  autoComplete="new-password"
                />
                {pwdForm.formState.errors.new_password && (
                  <p className="mt-1 text-xs text-red-500">{pwdForm.formState.errors.new_password.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirmer le nouveau mot de passe *</label>
                <input
                  {...pwdForm.register('confirm_password')}
                  type="password"
                  className={inputClass}
                  autoComplete="new-password"
                />
                {pwdForm.formState.errors.confirm_password && (
                  <p className="mt-1 text-xs text-red-500">{pwdForm.formState.errors.confirm_password.message}</p>
                )}
              </div>
              {changePwdMutation.isError && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {(changePwdMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                    ?? 'Erreur lors du changement de mot de passe.'}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowChangePwd(false); pwdForm.reset() }}
                  className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={changePwdMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {changePwdMutation.isPending && <Loader2 size={13} className="animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* ─── Métadonnées ────────────────────────────────────── */}
      {user?.obj && (
        <section className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <CalendarDays size={12} />
            <span>UID : <span className="font-mono">{user.obj.uid}</span></span>
          </div>
        </section>
      )}
    </div>
  )
}
