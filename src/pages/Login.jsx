import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
        navigate('/devis')
      }
    } catch (err) {
      setError(err.message || 'Erreur de connexion. Vérifiez vos identifiants.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      {/* Logo Neoflow Agency avec fond blanc arrondi et ombre */}
      <div className="mb-8 bg-white rounded-3xl px-10 py-5 shadow-lg">
        <img
          src="/logo-neoflow.png"
          alt="Neoflow Agency"
          className="h-28 object-contain"
        />
      </div>

      {/* Formulaire avec bordure bleu marine */}
      <div className="w-full max-w-md border-2 border-[#1e1b4b] rounded-3xl p-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Champ E-mail */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex : jean@gmail.com"
              required
              className="w-full bg-gray-100 rounded-full px-5 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e1b4b]/20"
            />
          </div>

          {/* Champ Mot de passe */}
          <div>
            <label className="block text-lg font-bold text-gray-900 mb-2">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=""
              required
              className="w-full bg-gray-100 rounded-full px-5 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1e1b4b]/20"
            />
          </div>

          {/* Lien mot de passe oublié */}
          <div>
            <button
              type="button"
              className="text-gray-600 italic underline text-sm hover:text-gray-800"
            >
              Mot de passe oubliée
            </button>
          </div>

          {/* Message d'erreur */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Bouton Se connecter */}
          <div className="flex justify-center pt-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-[#1e1b4b] text-white px-16 py-3.5 rounded-full font-semibold text-lg hover:bg-[#2d2a5d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
