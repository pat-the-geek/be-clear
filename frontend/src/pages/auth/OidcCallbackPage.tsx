import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useState } from 'react'

export default function OidcCallbackPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const errorParam = params.get('error')

    if (errorParam) {
      setError(`Le provider a retourné une erreur : ${errorParam}`)
      return
    }

    if (!code || !state) {
      setError('Paramètres manquants dans la réponse OIDC (code ou state absent).')
      return
    }

    // Vérifier le state stocké en sessionStorage
    const storedState = sessionStorage.getItem('oidc_state')
    if (!storedState || storedState !== state) {
      setError('State OIDC invalide — possible attaque CSRF. Reconnectez-vous.')
      return
    }
    sessionStorage.removeItem('oidc_state')

    const redirectUri = `${window.location.origin}/oidc-callback`

    authApi
      .oidcCallback(code, state, redirectUri)
      .then(async (res) => {
        const token = res.data.access_token
        useAuthStore.setState({ token })
        const meRes = await authApi.me()
        setAuth(token, meRes.data)
        navigate('/panel', { replace: true })
      })
      .catch((err) => {
        const msg = err?.response?.data?.detail || err?.message || 'Erreur inconnue'
        setError(`Échec de l'authentification OIDC : ${msg}`)
      })
  }, [navigate, setAuth])

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <AlertCircle size={40} className="text-red-500" />
        <p className="text-sm text-red-600 text-center max-w-sm">{error}</p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="text-sm text-blue-600 hover:underline"
        >
          Retour à la connexion
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Loader2 size={32} className="animate-spin text-blue-500" />
      <p className="text-sm text-gray-500">Authentification en cours…</p>
    </div>
  )
}
