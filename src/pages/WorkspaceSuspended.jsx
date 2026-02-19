import { useState, useEffect, useRef } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { invokeFunction } from '../lib/supabase'
import { createCheckoutSession, createPortalSession } from '../services/workspaceService'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function WorkspaceSuspended() {
  const { currentWorkspace, isOwner, subscriptionStatus, refreshWorkspaces } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const verifiedRef = useRef(false)

  const isIncomplete = subscriptionStatus === 'incomplete'

  // Auto-verify when workspace is incomplete (user just returned from Stripe checkout)
  useEffect(() => {
    if (isIncomplete && currentWorkspace?.id && !verifiedRef.current) {
      verifiedRef.current = true
      autoVerifyCheckout()
    }
  }, [isIncomplete, currentWorkspace?.id])

  const autoVerifyCheckout = async () => {
    setVerifying(true)
    try {
      const data = await invokeFunction('verify-checkout', {
        workspace_id: currentWorkspace.id,
      })

      if (data?.is_active) {
        await refreshWorkspaces()
        // Workspace is now active - hard redirect to dashboard
        window.location.href = '/dashboard'
        return
      }
    } catch (err) {
      console.error('Erreur vérification checkout:', err)
    }
    setVerifying(false)
  }

  const handleCompleteCheckout = async () => {
    setLoading(true)
    setError('')
    try {
      const { url } = await createCheckoutSession(currentWorkspace.id)
      window.location.href = url
    } catch (err) {
      console.error('Erreur checkout:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  const handleManageBilling = async () => {
    setLoading(true)
    setError('')
    try {
      const { url } = await createPortalSession(currentWorkspace.id)
      window.location.href = url
    } catch (err) {
      console.error('Erreur portail:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  // Show loading while auto-verifying
  if (verifying) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <BackgroundPattern />
        <div className="mb-8 relative z-10">
          <img src="/logo-neoflow.png" alt="Neoflow Agency" className="h-20 object-contain" />
        </div>
        <div className="w-full max-w-md bg-white border-2 border-[#040741] rounded-3xl p-6 md:p-10 shadow-xl relative z-10">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#313ADF] border-t-transparent mx-auto mb-4"></div>
            <p className="text-[#040741] font-medium">Vérification de votre paiement...</p>
            <p className="text-gray-400 text-sm mt-2">Cela ne prend que quelques secondes</p>
          </div>
        </div>
      </div>
    )
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
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
            isIncomplete ? 'bg-amber-100' : 'bg-red-100'
          }`}>
            {isIncomplete ? (
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            )}
          </div>

          <h1 className="text-2xl font-bold text-[#040741]">
            {isIncomplete ? 'Finalisez votre abonnement' : 'Abonnement suspendu'}
          </h1>

          <p className="text-gray-500 mt-2">
            {isIncomplete
              ? 'Votre workspace a été créé mais le paiement n\'a pas été finalisé.'
              : isOwner
                ? 'Votre abonnement est actuellement suspendu. Veuillez régulariser votre situation pour continuer à utiliser NeoFlow BOS.'
                : 'Ce workspace est actuellement suspendu. Contactez le propriétaire pour régulariser la situation.'
            }
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {isIncomplete && isOwner && (
          <div className="space-y-3">
            <button
              onClick={handleCompleteCheckout}
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Redirection...
                </span>
              ) : 'Compléter le paiement'}
            </button>
            <button
              onClick={autoVerifyCheckout}
              disabled={verifying}
              className="w-full bg-gray-100 text-[#040741] py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              J'ai déjà payé - Vérifier
            </button>
          </div>
        )}

        {!isIncomplete && isOwner && (
          <button
            onClick={handleManageBilling}
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Redirection...
              </span>
            ) : 'Gérer mon abonnement'}
          </button>
        )}

        {currentWorkspace?.name && (
          <p className="text-center text-xs text-gray-400 mt-4">
            Workspace : {currentWorkspace.name}
          </p>
        )}
      </div>

      <p className="mt-8 text-gray-400 text-sm relative z-10">
        Propulsé par Neoflow Agency
      </p>
    </div>
  )
}
