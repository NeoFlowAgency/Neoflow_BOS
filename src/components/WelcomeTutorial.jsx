import { useState } from 'react'

const steps = [
  {
    title: 'Bienvenue sur NeoFlow BOS',
    description: 'Votre outil de gestion tout-en-un : factures, devis, clients et statistiques.',
    icon: (
      <svg className="w-12 h-12 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    title: 'Créez vos factures et devis',
    description: 'Ajoutez vos produits, sélectionnez un client et générez un document en quelques clics. Envoyez par email ou téléchargez le PDF.',
    icon: (
      <svg className="w-12 h-12 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  {
    title: 'Gérez vos clients comme un CRM',
    description: 'Suivez l\'historique de chaque client : factures, devis, interactions. Tout est centralisé dans une fiche client.',
    icon: (
      <svg className="w-12 h-12 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )
  },
  {
    title: 'Analysez vos performances',
    description: 'Consultez votre chiffre d\'affaires, vos meilleurs produits et vos vendeurs les plus performants depuis le dashboard.',
    icon: (
      <svg className="w-12 h-12 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  }
]

export default function WelcomeTutorial({ onClose }) {
  const [currentStep, setCurrentStep] = useState(0)

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleFinish()
    }
  }

  const handleFinish = () => {
    localStorage.setItem('neoflow_tuto_done', 'true')
    onClose()
  }

  const step = steps[currentStep]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === currentStep ? 'w-8 bg-[#313ADF]' : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center">
            {step.icon}
          </div>
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[#040741] mb-3">{step.title}</h2>
          <p className="text-gray-500 leading-relaxed">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleFinish}
            className="text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
          >
            Passer
          </button>

          <button
            onClick={handleNext}
            className="bg-gradient-to-r from-[#040741] to-[#313ADF] text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg"
          >
            {currentStep < steps.length - 1 ? 'Suivant' : 'Commencer'}
          </button>
        </div>
      </div>
    </div>
  )
}
