import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { invokeFunction } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function JoinWorkspace() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshWorkspaces } = useWorkspace()
  const [status, setStatus] = useState('loading') // loading | success | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Aucun token d\'invitation fourni')
      return
    }

    acceptInvitation()
  }, [token])

  const acceptInvitation = async () => {
    try {
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
      setError(err.message)
      setStatus('error')
    }
  }

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
        {status === 'loading' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent mx-auto mb-4"></div>
            <p className="text-[#040741] font-medium">Acceptation de l'invitation...</p>
          </div>
        )}

        {status === 'success' && result && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#040741] mb-2">Bienvenue !</h1>
            <p className="text-gray-500">
              Vous avez rejoint le workspace <span className="font-semibold text-[#040741]">{result.workspace.name}</span> en tant que <span className="font-semibold text-[#313ADF]">{result.role}</span>.
            </p>
            <p className="text-sm text-gray-400 mt-4">Redirection vers le tableau de bord...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#040741] mb-2">Invitation invalide</h1>
            <p className="text-gray-500 mb-6">{error}</p>
            <button
              onClick={() => navigate('/dashboard', { replace: true })}
              className="bg-[#313ADF] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors"
            >
              Retour au tableau de bord
            </button>
          </div>
        )}
      </div>

      <p className="mt-8 text-gray-400 text-sm relative z-10">
        Propulsé par Neoflow Agency
      </p>
    </div>
  )
}
