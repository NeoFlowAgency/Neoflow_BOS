import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function WorkspaceChoice() {
  const navigate = useNavigate()
  const [showTutorial, setShowTutorial] = useState(false)

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BackgroundPattern />

      <div className="mb-8 relative z-10">
        <img src="/logo-neoflow.png" alt="Neoflow Agency" className="h-20 object-contain" />
      </div>

      <div className="w-full max-w-2xl relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Bienvenue sur NeoFlow BOS</h1>
          <p className="text-gray-500 mt-2">Comment souhaitez-vous commencer ?</p>
        </div>

        {!showTutorial ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create workspace */}
            <button
              onClick={() => navigate('/onboarding/workspace')}
              className="bg-white border-2 border-[#040741] rounded-3xl p-8 shadow-xl hover:shadow-2xl hover:border-[#313ADF] transition-all text-left group"
            >
              <div className="w-14 h-14 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-[#313ADF]/20 transition-colors">
                <svg className="w-7 h-7 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#040741] mb-2">Créer un workspace</h2>
              <p className="text-gray-500 text-sm">
                Créez votre entreprise sur NeoFlow BOS et commencez à gérer vos factures, devis et clients.
              </p>
            </button>

            {/* Join workspace */}
            <button
              onClick={() => setShowTutorial(true)}
              className="bg-white border-2 border-gray-200 rounded-3xl p-8 shadow-xl hover:shadow-2xl hover:border-[#313ADF] transition-all text-left group"
            >
              <div className="w-14 h-14 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-[#313ADF]/20 transition-colors">
                <svg className="w-7 h-7 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-[#040741] mb-2">Rejoindre un workspace</h2>
              <p className="text-gray-500 text-sm">
                Vous avez reçu une invitation ? Rejoignez le workspace d'un collègue ou partenaire.
              </p>
            </button>
          </div>
        ) : (
          <div className="bg-white border-2 border-[#040741] rounded-3xl p-6 md:p-10 shadow-xl">
            <button
              onClick={() => setShowTutorial(false)}
              className="flex items-center gap-2 text-gray-500 hover:text-[#040741] transition-colors mb-6"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour
            </button>

            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[#040741] mb-2">Comment rejoindre un workspace</h2>
              <p className="text-gray-500">Suivez ces étapes pour rejoindre un workspace existant</p>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-[#313ADF] text-white rounded-xl flex items-center justify-center font-bold">1</div>
                <div>
                  <h3 className="font-bold text-[#040741] mb-1">Demandez un lien d'invitation</h3>
                  <p className="text-gray-500 text-sm">
                    Le propriétaire ou un administrateur du workspace doit générer un lien d'invitation depuis
                    <span className="font-medium text-[#040741]"> Paramètres &gt; Workspace &gt; Inviter un membre</span>.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-[#313ADF] text-white rounded-xl flex items-center justify-center font-bold">2</div>
                <div>
                  <h3 className="font-bold text-[#040741] mb-1">Ouvrez le lien</h3>
                  <p className="text-gray-500 text-sm">
                    Cliquez sur le lien d'invitation que vous avez reçu. Il ressemble à :
                  </p>
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm font-mono text-gray-600">
                    https://votre-app.vercel.app/join?token=abc123...
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-[#313ADF] text-white rounded-xl flex items-center justify-center font-bold">3</div>
                <div>
                  <h3 className="font-bold text-[#040741] mb-1">Vous êtes membre !</h3>
                  <p className="text-gray-500 text-sm">
                    Après avoir cliqué sur le lien, vous serez automatiquement ajouté au workspace avec le rôle attribué par l'administrateur.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-[#313ADF]/5 border border-[#313ADF]/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#313ADF] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-gray-600">
                  Les liens d'invitation expirent après <span className="font-semibold">7 jours</span>. Si votre lien a expiré, demandez-en un nouveau.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 relative z-10">
        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/login'
          }}
          className="text-gray-400 hover:text-red-500 text-sm font-medium transition-colors flex items-center gap-2 mx-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Se déconnecter
        </button>
      </div>

      <p className="mt-4 text-gray-400 text-sm relative z-10">
        Propulsé par Neoflow Agency
      </p>
    </div>
  )
}
