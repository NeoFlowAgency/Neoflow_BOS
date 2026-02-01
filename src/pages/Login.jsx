import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reset password states
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        throw authError
      }

      if (data.user) {
        navigate('/dashboard')
      }
    } catch (err) {
      if (err.message.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect')
      } else {
        setError(err.message || 'Erreur de connexion')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setResetError('')
    setResetMessage('')
    setResetLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      setResetMessage('Un email de réinitialisation a été envoyé. Vérifiez votre boîte mail.')
      setTimeout(() => {
        setShowResetModal(false)
        setResetEmail('')
        setResetMessage('')
      }, 3000)
    } catch (err) {
      setResetError(err.message || 'Erreur lors de l\'envoi de l\'email')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BackgroundPattern />

      {/* Logo Neoflow Agency */}
      <div className="mb-8 relative z-10">
        <img
          src="/logo-neoflow.png"
          alt="Neoflow Agency"
          className="h-20 object-contain"
        />
      </div>

      {/* Formulaire de connexion */}
      <div className="w-full max-w-md bg-white border-2 border-[#040741] rounded-3xl p-10 shadow-xl relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#040741]">Connexion</h1>
          <p className="text-gray-500 mt-2">Accédez à votre espace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">
              Adresse email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemple@email.com"
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] transition-all"
            />
          </div>

          <div className="text-right">
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="text-[#313ADF] text-sm font-medium hover:underline"
            >
              Mot de passe oublié ?
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connexion...
              </span>
            ) : 'Se connecter'}
          </button>
        </form>
      </div>

      {/* Modal Reset Password */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#040741]">Réinitialiser le mot de passe</h2>
              <button
                onClick={() => {
                  setShowResetModal(false)
                  setResetEmail('')
                  setResetError('')
                  setResetMessage('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-gray-500 mb-6">
              Entrez votre adresse email pour recevoir un lien de réinitialisation.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#040741] mb-2">
                  Adresse email
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="exemple@email.com"
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF]"
                />
              </div>

              {resetError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                  {resetError}
                </div>
              )}

              {resetMessage && (
                <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {resetMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full bg-[#313ADF] text-white py-3 rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50"
              >
                {resetLoading ? 'Envoi en cours...' : 'Envoyer le lien'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="mt-8 text-gray-400 text-sm relative z-10">
        Propulsé par Neoflow Agency
      </p>
    </div>
  )
}
