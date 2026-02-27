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
    isWelcome: true,
    title: 'Bienvenue sur NeoFlow BOS !',
    description: 'Votre OS metier pour la literie. En quelques etapes, decouvrez comment gerer vos ventes, votre stock, vos livraisons et vos statistiques. Des donnees de demonstration seront creees pour ce tutoriel.',
  },
  {
    id: 'dashboard',
    route: '/dashboard',
    target: 'quick-actions',
    position: 'top',
    title: 'Tableau de bord',
    description: 'Votre centre de pilotage : CA du mois, commandes en cours, livraisons a effectuer et soldes a recuperer. Les actions rapides vous permettent de demarrer une vente en un clic.',
  },
  {
    id: 'produits',
    route: '/produits',
    target: null,
    position: 'bottom',
    title: 'Catalogue produits',
    description: 'Trois produits de demonstration ont ete crees (matelas, sommier, oreiller). Chaque produit a un prix de vente, un cout d\'achat et une reference. La marge est calculee automatiquement et visible pour les managers.',
  },
  {
    id: 'vente-rapide',
    route: '/vente-rapide',
    target: null,
    position: 'bottom',
    title: 'Vente rapide',
    description: 'Pour les ventes comptoir ou client inconnu : selectionnez les produits, choisissez le mode de paiement, confirmez. Une commande et une facture simplifiee sont generees instantanement.',
  },
  {
    id: 'commandes',
    route: '/commandes',
    target: null,
    position: 'bottom',
    title: 'Commandes',
    description: 'La commande est l\'element central de NeoFlow BOS. Une commande de demonstration a ete creee depuis le devis test. Elle inclut un acompte de 30 % et une livraison planifiee dans 7 jours.',
  },
  {
    id: 'paiements',
    route: '/commandes',
    target: null,
    position: 'bottom',
    title: 'Suivi des paiements',
    description: 'Chaque commande peut recevoir plusieurs paiements : acompte, paiement partiel, solde. Une barre de progression indique le montant recu vs le total. Vous pouvez enregistrer un paiement depuis la fiche commande.',
  },
  {
    id: 'stock',
    route: '/stock',
    target: null,
    position: 'bottom',
    title: 'Gestion du stock',
    description: 'Suivez vos niveaux de stock par produit et par emplacement. Les alertes vous signalent les ruptures et les stocks faibles. Le stock se met a jour automatiquement a chaque vente validee.',
  },
  {
    id: 'livraisons',
    route: '/livraisons',
    target: null,
    position: 'bottom',
    title: 'Livraisons',
    description: 'Gerez vos livraisons et retraits en vue kanban : A planifier > Planifiee > En cours > Livree. Les livreurs voient uniquement leurs livraisons assignees et peuvent enregistrer le paiement a la livraison.',
  },
  {
    id: 'statistiques',
    route: '/dashboard-financier',
    target: null,
    position: 'bottom',
    title: 'Statistiques',
    description: 'Analysez vos performances : evolution du CA, marge par produit, classement vendeurs, produits faible rotation et livraisons en retard. Les couts et marges sont reserves aux managers et proprietaires.',
  },
  {
    id: 'documentation',
    route: '/documentation',
    target: null,
    position: 'bottom',
    title: 'Documentation',
    description: 'Retrouvez ici tous les guides d\'utilisation de NeoFlow BOS. La documentation est accessible a toute l\'equipe. Les proprietaires peuvent modifier et publier de nouveaux articles.',
  },
  {
    id: 'neo',
    route: '/dashboard',
    target: null,
    position: 'bottom',
    title: 'Neo arrive bientot',
    description: 'Neo est votre assistant IA contextuel. Il vous guidera dans vos actions, repondra a vos questions et cherchera dans la documentation pour vous. Neo V1 est en cours de developpement.',
  },
  {
    id: 'cleanup',
    route: '/dashboard',
    target: null,
    position: 'bottom',
    isCleanup: true,
    title: 'Tutoriel termine !',
    description: 'Vous avez decouvert les fonctionnalites cles de NeoFlow BOS. Cliquez sur "Demarrer" pour supprimer les donnees de demonstration et commencer a utiliser votre espace de travail.',
  },
]

// Number of real tour steps (excluding welcome and cleanup)
const TOUR_STEPS = STEPS.filter(s => !s.isWelcome && !s.isCleanup)

export default function OnboardingTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const { workspace } = useWorkspace()
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [testDataCreated, setTestDataCreated] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [cleaning, setCleaning] = useState(false)

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
    }
  }

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  const handleFinish = async () => {
    setCleaning(true)
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
    } finally {
      setCleaning(false)
      setActive(false)
      navigate('/dashboard')
    }
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
    navigate('/dashboard')
  }

  if (!active) return null

  const currentStep = STEPS[step]

  // ── Welcome step ──────────────────────────────────────────────────────────
  if (currentStep.isWelcome) {
    return (
      <SpotlightOverlay targetSelector={null}>
        <div className="text-center">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#040741] mb-3">{currentStep.title}</h2>
          <p className="text-gray-600 text-sm mb-6">{currentStep.description}</p>
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm"
            >
              Passer
            </button>
            <button
              onClick={handleStart}
              disabled={initializing}
              className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50 text-sm"
            >
              {initializing ? 'Preparation...' : 'Commencer'}
            </button>
          </div>
        </div>
      </SpotlightOverlay>
    )
  }

  // ── Cleanup step ──────────────────────────────────────────────────────────
  if (currentStep.isCleanup) {
    return (
      <SpotlightOverlay targetSelector={null}>
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#040741] mb-3">{currentStep.title}</h2>
          <p className="text-gray-600 text-sm mb-6">{currentStep.description}</p>
          <div className="flex gap-3">
            <button
              onClick={handlePrev}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl font-semibold hover:bg-gray-200 transition-colors text-sm"
            >
              Retour
            </button>
            <button
              onClick={handleFinish}
              disabled={cleaning}
              className="flex-1 px-4 py-3 bg-[#313ADF] text-white rounded-xl font-semibold hover:bg-[#040741] transition-colors disabled:opacity-50 text-sm"
            >
              {cleaning ? 'Nettoyage...' : 'Demarrer'}
            </button>
          </div>
        </div>
      </SpotlightOverlay>
    )
  }

  // ── Tour steps (1 to N-1) ─────────────────────────────────────────────────
  // step index among tour steps (1-based → 0-based for indicator)
  const tourIndex = step - 1  // steps 1..10 → index 0..9

  return (
    <SpotlightOverlay targetSelector={currentStep.target} position={currentStep.position}>
      <div>
        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-4">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < tourIndex ? 'bg-[#313ADF]' : i === tourIndex ? 'bg-[#313ADF]/60' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-1">Etape {tourIndex + 1} / {TOUR_STEPS.length}</p>
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
              Suivant
            </button>
          </div>
        </div>
      </div>
    </SpotlightOverlay>
  )
}
