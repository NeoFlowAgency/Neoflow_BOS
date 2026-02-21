import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../contexts/WorkspaceContext'
import SpotlightOverlay from './ui/SpotlightOverlay'
import { createTestData, deleteTestData, markOnboardingComplete, shouldShowOnboarding } from '../services/onboardingService'

const STEPS = [
  {
    id: 'welcome',
    route: '/dashboard',
    target: null,
    position: 'bottom',
    title: 'Bienvenue sur NeoFlow BOS !',
    description: 'Merci d\'utiliser notre application. Ce tutoriel va vous guider a travers les fonctionnalites principales. Des donnees de test seront creees pour la demonstration.',
  },
  {
    id: 'dashboard',
    route: '/dashboard',
    target: 'quick-actions',
    position: 'top',
    title: 'Tableau de bord',
    description: 'Voici votre tableau de bord. Vous y trouverez vos statistiques principales et des actions rapides pour creer des factures, devis et livraisons.',
  },
  {
    id: 'produits',
    route: '/produits',
    target: null,
    position: 'bottom',
    title: 'Catalogue produits',
    description: 'Gerez ici votre catalogue de produits et services. Chaque produit a un prix HT et un taux de TVA. Ils seront disponibles lors de la creation de factures et devis.',
  },
  {
    id: 'devis',
    route: '/devis',
    target: null,
    position: 'bottom',
    title: 'Gestion des devis',
    description: 'Creez et gerez vos devis. Vous pouvez les envoyer a vos clients et les convertir en factures une fois acceptes. Un devis de demonstration a ete cree.',
  },
  {
    id: 'factures',
    route: '/factures',
    target: null,
    position: 'bottom',
    title: 'Gestion des factures',
    description: 'Suivez toutes vos factures ici. Vous pouvez les creer, les envoyer, et suivre leur statut (brouillon, envoyee, payee). Une facture de demonstration a ete creee.',
  },
  {
    id: 'clients',
    route: '/clients',
    target: null,
    position: 'bottom',
    title: 'CRM - Gestion clients',
    description: 'Votre base de donnees clients. Les clients sont automatiquement crees lors de la creation de factures/devis, ou vous pouvez les ajouter manuellement.',
  },
  {
    id: 'livraisons',
    route: '/livraisons',
    target: null,
    position: 'bottom',
    title: 'Gestion des livraisons',
    description: 'Suivez vos livraisons en temps reel. Creez des livraisons liees a vos factures et suivez leur avancement (en cours, livree, annulee).',
  },
  {
    id: 'stats',
    route: '/dashboard-financier',
    target: null,
    position: 'bottom',
    title: 'Dashboard financier',
    description: 'Analysez vos performances : evolution du CA, repartition des factures, classement produits et vendeurs. Cliquez sur un graphique pour l\'agrandir en plein ecran.',
  },
  {
    id: 'settings',
    route: '/settings',
    target: null,
    position: 'bottom',
    title: 'Parametres',
    description: 'Configurez votre compte, votre workspace (informations entreprise, logo, coordonnees bancaires), gerez les membres et les invitations. C\'est termine !',
  },
]

export default function OnboardingTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace } = useWorkspace()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [testDataCreated, setTestDataCreated] = useState(false)
  const [initializing, setInitializing] = useState(false)

  // Check if tour should start
  useEffect(() => {
    if (!workspace?.id) return
    if (shouldShowOnboarding()) {
      setActive(true)
    }
  }, [workspace?.id])

  // Navigate to current step's route
  useEffect(() => {
    if (!active) return
    const currentStep = STEPS[step]
    if (currentStep && location.pathname !== currentStep.route) {
      navigate(currentStep.route)
    }
  }, [active, step])

  const handleStart = async () => {
    if (!workspace?.id) return
    setInitializing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await createTestData(workspace.id, user.id)
        setTestDataCreated(true)
      }
    } catch (err) {
      console.error('[onboarding] Error starting tour:', err)
    } finally {
      setInitializing(false)
      setStep(1)
    }
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      handleFinish()
    }
  }

  const handlePrev = () => {
    if (step > 0) {
      setStep(step - 1)
    }
  }

  const handleFinish = async () => {
    setActive(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await markOnboardingComplete(user.id)
      }
      if (testDataCreated && workspace?.id) {
        await deleteTestData(workspace.id)
      }
    } catch (err) {
      console.error('[onboarding] Error finishing tour:', err)
    }
    navigate('/dashboard')
  }

  const handleSkip = async () => {
    setActive(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await markOnboardingComplete(user.id)
      }
      if (testDataCreated && workspace?.id) {
        await deleteTestData(workspace.id)
      }
    } catch (err) {
      console.error('[onboarding] Error skipping tour:', err)
    }
  }

  if (!active) return null

  const currentStep = STEPS[step]

  // Welcome step (step 0) - special layout
  if (step === 0) {
    return (
      <SpotlightOverlay targetSelector={null}>
        <div className="text-center">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#040741] mb-3">{currentStep.title}</h2>
          <p className="text-gray-600 text-sm mb-6">{currentStep.description}</p>
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Passer
            </button>
            <button
              onClick={handleStart}
              disabled={initializing}
              className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50"
            >
              {initializing ? 'Preparation...' : 'Commencer'}
            </button>
          </div>
        </div>
      </SpotlightOverlay>
    )
  }

  return (
    <SpotlightOverlay targetSelector={currentStep.target} position={currentStep.position}>
      <div>
        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.slice(1).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < step ? 'bg-[#313ADF]' : i === step - 1 ? 'bg-[#313ADF]' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-1">Etape {step} / {STEPS.length - 1}</p>
        <h2 className="text-lg font-bold text-[#040741] mb-2">{currentStep.title}</h2>
        <p className="text-gray-600 text-sm mb-6">{currentStep.description}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-400 hover:text-gray-600 font-medium"
          >
            Quitter
          </button>
          <div className="flex gap-2">
            {step > 1 && (
              <button
                onClick={handlePrev}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm"
              >
                Precedent
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#040741] transition-colors text-sm"
            >
              {step === STEPS.length - 1 ? 'Terminer' : 'Suivant'}
            </button>
          </div>
        </div>
      </div>
    </SpotlightOverlay>
  )
}
