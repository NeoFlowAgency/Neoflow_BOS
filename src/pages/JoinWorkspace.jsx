import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase, invokeFunction } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function JoinWorkspace() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshWorkspaces } = useWorkspace()
  const [status, setStatus] = useState('checking') // checking | not_authenticated | loading | success | already_member | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError("Aucun token d'invitation fourni")
      return
    }

    checkAuthAndAccept()
  }, [token])

  const checkAuthAndAccept = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await acceptInvitation()
      } else {
        setStatus('not_authenticated')
      }
    } catch {
      setStatus('not_authenticated')
    }
  }

  const acceptInvitation = async () => {
    try {
      setStatus('loading')
      const data = await invokeFunction('accept-invitation', { token })

      setResult(data)
      setStatus('success')

      await refreshWorkspaces()

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 2000)
    } catch (err) {
      console.error('Erreur acceptation invitation:', err)
      if (err.message?.includes('deja membre')) {
        setStatus('already_member')
      } else {
        setError(err.message)
        setStatus('error')
      }
    }
  }

  const redirectUrl = encodeURIComponent(`/join?token=${token}`)

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BackgroundPattern />

      <div className="mb-8 relative z-10">
        <img
          src="/logo-neoflow.png"
          alt="Neoflow Agency"
          className="h-20 object-contain"
        />
      </div>

      <div className="w-full max-w-md bg-white border-2 border-[#040741] rounded-3xl p-6 md:p-10 shadow-xl relative z-10">
        {/* Checking auth */}
        {status === 'checking' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent mx-auto mb-4"></div>
            <p className="text-[#040741] font-medium">Vérification...</p>
          </div>
        )}

        {/* Not authenticated - show login/signup options */}
        {status === 'not_authenticated' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#040741] mb-2">Invitation workspace</h1>
            <p className="text-gray-500 mb-6">
              Pour accepter cette invitation, connectez-vous ou créez un compte.
            </p>
            <div className="space-y-3">
              <Link
                to={`/login?redirect=${redirectUrl}`}
                className="block w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-3 rounded-xl font-semibold text-center hover:opacity-90 transition-opacity"
              >
                Se connecter
              </Link>
              <Link
                to={`/signup?redirect=${redirectUrl}`}
                className="block w-full bg-gray-100 text-[#040741] py-3 rounded-xl font-semibold text-center hover:bg-gray-200 transition-colors"
              >
                Créer un compte
              </Link>
            </div>
          </div>
        )}

        {/* Loading - accepting invitation */}
        {status === 'loading' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent mx-auto mb-4"></div>
            <p className="text-[#040741] font-medium">Acceptation de l'invitation...</p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && result && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#040741] mb-2">Bienvenue !</h1>
            <p className="text-gray-500">
              Vous avez rejoint le workspace <span className="font-semibold text-[#040741]">{result.workspace?.name}</span> en tant que <span className="font-semibold text-[#313ADF]">{result.role}</span>.
            </p>
            <p className="text-sm text-gray-400 mt-4">Redirection vers le tableau de bord...</p>
          </div>
        )}

        {/* Already a member */}
        {status === 'already_member' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#040741] mb-2">Déjà membre</h1>
            <p className="text-gray-500 mb-6">
              Vous êtes déjà membre de ce workspace avec votre compte actuel.
            </p>
            <div className="space-y-3">
              <Link
                to="/dashboard"
                className="block w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-3 rounded-xl font-semibold text-center hover:opacity-90 transition-opacity"
              >
                Aller au tableau de bord
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  setStatus('not_authenticated')
                }}
                className="block w-full bg-gray-100 text-[#040741] py-3 rounded-xl font-semibold text-center hover:bg-gray-200 transition-colors"
              >
                Utiliser un autre compte
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#040741] mb-2">Invitation invalide</h1>
            <p className="text-gray-500 mb-6">{error}</p>
            <div className="space-y-3">
              <Link
                to="/login"
                className="block w-full bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold text-center hover:bg-[#040741] transition-colors"
              >
                Retour à la connexion
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  setStatus('not_authenticated')
                }}
                className="block w-full bg-gray-100 text-[#040741] py-3 rounded-xl font-semibold text-center hover:bg-gray-200 transition-colors"
              >
                Utiliser un autre compte
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-8 text-gray-400 text-sm relative z-10">
        Propulsé par Neoflow Agency
      </p>
    </div>
  )
}
