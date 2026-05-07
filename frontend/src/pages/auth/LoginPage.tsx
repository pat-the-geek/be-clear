import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

const schema = z.object({
  username: z.string().min(1, 'Identifiant requis'),
  password: z.string().min(1, 'Mot de passe requis'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Config OIDC publique
  const { data: oidcConf } = useQuery({
    queryKey: ['oidc-config'],
    queryFn: () => authApi.oidcConfig().then((r) => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const oidcEnabled = oidcConf?.enabled ?? false
  const showLocalForm = !oidcEnabled || (oidcConf?.allow_local_login ?? true)

  // Login local
  const mutation = useMutation({
    mutationFn: (data: FormData) => authApi.login(data),
    onSuccess: async (res) => {
      const token = res.data.access_token
      useAuthStore.setState({ token })
      const meRes = await authApi.me()
      setAuth(token, meRes.data)
      navigate('/panel')
    },
  })

  // Login OIDC
  const oidcMutation = useMutation({
    mutationFn: async () => {
      const redirectUri = `${window.location.origin}/oidc-callback`
      const res = await authApi.oidcAuthorizeUrl(redirectUri)
      sessionStorage.setItem('oidc_state', res.data.state)
      window.location.href = res.data.url
    },
  })

  return (
    <div className="space-y-4">
      {/* Bouton OIDC */}
      {oidcEnabled && (
        <button
          type="button"
          onClick={() => oidcMutation.mutate()}
          disabled={oidcMutation.isPending}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 bg-white text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <LogIn size={15} />
          {oidcMutation.isPending ? 'Redirection…' : 'Connexion via SSO'}
        </button>
      )}

      {/* Séparateur */}
      {oidcEnabled && showLocalForm && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          ou
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {/* Formulaire local */}
      {showLocalForm && (
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant</label>
            <input
              {...register('username')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="username"
            />
            {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              {...register('password')}
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>
          {mutation.isError && (
            <p className="text-red-500 text-sm">Identifiants incorrects.</p>
          )}
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      )}

      {/* OIDC seulement, pas de formulaire local */}
      {oidcEnabled && !showLocalForm && oidcMutation.isError && (
        <p className="text-red-500 text-sm text-center">
          Erreur lors de la redirection SSO. Réessayez.
        </p>
      )}
    </div>
  )
}
