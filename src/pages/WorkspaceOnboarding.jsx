import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createWorkspace } from '../services/workspaceService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function WorkspaceOnboarding() {
  const navigate = useNavigate()
  const { currentWorkspace, refreshWorkspaces } = useWorkspace()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // If user already has a workspace, redirect to dashboard
  useEffect(() => {
    if (currentWorkspace) {
      navigate('/dashboard', { replace: true })
    }
  }, [currentWorkspace, navigate])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Veuillez entrer un nom pour votre workspace')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Utilisateur non authentifié')

      await createWorkspace(name.trim(), user.id)
      await refreshWorkspaces()
      navigate('/dashboard')
    } catch (err) {
      console.error('Erreur création workspace:', err)
      setError(err.message || 'Erreur lors de la création du workspace')
    } finally {
      setLoading(false)
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

      <div className="w-full max-w-md bg-white border-2 border-[#040741] rounded-3xl p-10 shadow-xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#040741]">Créer votre workspace</h1>
          <p className="text-gray-500 mt-2">
            Configurez votre espace de travail pour commencer
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-[#040741] mb-2">
              Nom du workspace
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Ma Boutique, Mon Entreprise..."
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] transition-all"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                Création en cours...
              </span>
            ) : 'Créer mon workspace'}
          </button>
        </form>
      </div>

      <p className="mt-8 text-gray-400 text-sm relative z-10">
        Propulsé par Neoflow Agency
      </p>
    </div>
  )
}
