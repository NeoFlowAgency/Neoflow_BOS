import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import {
  createTestData,
  deleteTestData,
  markOnboardingComplete,
  shouldShowOnboarding,
} from '../services/onboardingService'
import { supabase } from '../lib/supabase'

// ─── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  // ── Welcome modal ──
  {
    id: 'welcome',
    type: 'modal',
    emoji: '👋',
    title: 'Bienvenue sur NeoFlow BOS !',
    description:
      'Ce tutoriel interactif (≈ 10 min) vous guide à travers toutes les fonctionnalités clés. Des données de démonstration seront créées pour que vous voyiez l\'interface en situation réelle. Vous effectuerez de vraies actions, puis tout sera nettoyé à la fin.',
    buttonText: 'Démarrer le tutoriel',
  },

  // ── 1 · Dashboard ──
  {
    id: 'dashboard',
    type: 'tour',
    route: '/dashboard',
    emoji: '📊',
    title: 'Tableau de bord',
    description:
      'Votre centre de pilotage. Les données de démonstration sont déjà visibles : chiffre d\'affaires, commandes en cours, livraisons à effectuer, acomptes à encaisser.',
    tip: 'Les KPIs se mettent à jour en temps réel dès que vous enregistrez une vente ou un paiement.',
  },

  // ── 2 · Produits ──
  {
    id: 'products',
    type: 'tour',
    route: '/produits',
    emoji: '🏷️',
    title: 'Catalogue produits',
    description:
      'Trois produits de démonstration ont été créés : matelas, sommier et oreiller — avec prix de vente, coût d\'achat et marge calculée automatiquement.',
    tip: 'La marge n\'est visible que par les propriétaires et managers, jamais par les vendeurs ni sur les documents clients.',
  },

  // ── 3 · Créer un produit (INTERACTIVE) ──
  {
    id: 'create-product',
    type: 'tour',
    route: '/produits',
    emoji: '➕',
    title: 'À vous : créez un produit',
    description: 'Ajoutez votre premier article réel au catalogue.',
    interactive: true,
    instructions: [
      'Cliquez sur le bouton "Nouveau produit" en haut à droite',
      'Saisissez un nom, un prix de vente et optionnellement un coût d\'achat',
      'Cliquez "Enregistrer" pour valider',
    ],
    confirmText: 'Mon produit est créé ✓',
  },

  // ── 4 · Clients ──
  {
    id: 'clients',
    type: 'tour',
    route: '/clients',
    emoji: '👥',
    title: 'Gestion clients (CRM)',
    description:
      'Un client de démonstration a été créé. Chaque fiche client regroupe ses coordonnées, son historique de commandes et son CA total. Le statut (prospect → actif → prioritaire) est calculé automatiquement.',
    tip: 'Un client devient "prioritaire" dès 5 000€ de CA cumulé, ou en le marquant manuellement.',
  },

  // ── 5 · Créer un devis (INTERACTIVE) ──
  {
    id: 'create-quote',
    type: 'tour',
    route: '/devis',
    emoji: '📄',
    title: 'À vous : créez un devis',
    description:
      'Les devis permettent de faire une proposition commerciale avant de la transformer en commande.',
    interactive: true,
    instructions: [
      'Cliquez sur "Nouveau devis"',
      'Sélectionnez le client "[TUTORIEL]" dans la liste',
      'Ajoutez une ligne produit avec une quantité et un prix',
      'Enregistrez le devis — il apparaîtra dans la liste',
    ],
    confirmText: 'Mon devis est créé ✓',
  },

  // ── 6 · Commandes ──
  {
    id: 'orders',
    type: 'tour',
    route: '/commandes',
    emoji: '🛒',
    title: 'Gestion des commandes',
    description:
      'Le cœur du système. Une commande de démonstration a été créée avec un acompte déjà versé. Chaque commande suit son cycle : Brouillon → Confirmé → En cours → Livré → Terminé.',
    tip: 'Un devis converti en commande conserve tous les produits et le client — aucune ressaisie.',
  },

  // ── 7 · Enregistrer un paiement (INTERACTIVE) ──
  {
    id: 'payment',
    type: 'tour',
    route: '/commandes',
    emoji: '💳',
    title: 'À vous : enregistrez un paiement',
    description:
      'Les paiements sont multiples et flexibles : acompte, règlement partiel, solde. La barre de progression se met à jour en temps réel.',
    interactive: true,
    instructions: [
      'Ouvrez la commande de démonstration (statut "Confirmé") dans la liste',
      'Dans la section "Paiements", cliquez "Enregistrer un paiement"',
      'Saisissez un montant, choisissez le mode (espèces, CB, chèque…)',
      'Confirmez et observez la barre de progression se mettre à jour',
    ],
    confirmText: 'Paiement enregistré ✓',
  },

  // ── 8 · Vente rapide (INTERACTIVE) ──
  {
    id: 'quick-sale',
    type: 'tour',
    route: '/vente-rapide',
    emoji: '⚡',
    title: 'À vous : faites une vente rapide',
    description:
      'Pour les ventes comptoir, la vente rapide crée commande + facture simplifiée en quelques clics. Le client est optionnel.',
    interactive: true,
    instructions: [
      'Recherchez et sélectionnez un produit dans la barre de recherche',
      'Ajustez la quantité si nécessaire',
      'Choisissez le mode de paiement (espèces, CB…)',
      'Cliquez "Confirmer la vente" — la facture est générée automatiquement',
    ],
    confirmText: 'Vente rapide effectuée ✓',
  },

  // ── 9 · Stock ──
  {
    id: 'stock',
    type: 'tour',
    route: '/stock',
    emoji: '📦',
    title: 'Gestion du stock',
    description:
      'Suivez vos niveaux de stock par emplacement. Les produits de démo ont du stock. Les alertes apparaissent en rouge (rupture) ou orange (stock faible).',
    tip: 'Le stock est réservé à la confirmation d\'une commande et débité lors du paiement complet.',
  },

  // ── 10 · Livraisons ──
  {
    id: 'deliveries',
    type: 'tour',
    route: '/livraisons',
    emoji: '🚚',
    title: 'Planning des livraisons',
    description:
      'Organisez vos livraisons en kanban. Une livraison de démonstration est planifiée. Assignez un livreur, définissez un créneau horaire.',
    tip: 'Le livreur voit uniquement ses livraisons assignées et peut encaisser le paiement directement.',
  },

  // ── 11 · Statistiques ──
  {
    id: 'stats',
    type: 'tour',
    route: '/dashboard-financier',
    emoji: '📈',
    title: 'Statistiques & Performances',
    description:
      'Analysez votre activité : CA, marges par produit, performance vendeurs, taux de conversion devis → vente. Les données de démo rendent les graphiques exploitables dès maintenant.',
    tip: 'Les marges et coûts d\'achat n\'apparaissent jamais sur les documents envoyés aux clients.',
  },

  // ── Done modal ──
  {
    id: 'done',
    type: 'modal',
    emoji: '🎉',
    title: 'Félicitations !',
    description:
      'Vous maîtrisez NeoFlow BOS. Vous avez créé des produits, des devis, enregistré des paiements et effectué une vente rapide. Les données de démonstration vont maintenant être supprimées — votre workspace sera vierge et prêt pour votre vraie activité.',
    buttonText: 'Terminer et nettoyer le workspace',
  },
]

const TOUR_STEPS = STEPS.filter((s) => s.type === 'tour')
const TOTAL_STEPS = TOUR_STEPS.length // 11

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PulseBeacon({ color = '#313ADF' }) {
  return (
    <span className="relative flex h-3 w-3 flex-shrink-0">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }}
      />
      <span
        className="relative inline-flex rounded-full h-3 w-3"
        style={{ backgroundColor: color }}
      />
    </span>
  )
}

// ─── Minimised pill ───────────────────────────────────────────────────────────

function MinimisedPill({ stepIdx, onRestore }) {
  return (
    <button
      onClick={onRestore}
      className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 bg-[#313ADF] text-white px-4 py-2 rounded-full shadow-lg hover:bg-[#2730c4] transition-all text-sm font-medium"
    >
      <PulseBeacon color="#fff" />
      <span>Tutoriel — étape {stepIdx + 1}/{TOTAL_STEPS}</span>
    </button>
  )
}

// ─── Welcome / Done modal ────────────────────────────────────────────────────

function TourModal({ step, onAction, loading }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#040741]/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 flex flex-col items-center text-center gap-6">
        <div className="text-6xl">{step.emoji}</div>
        <div>
          <h2 className="text-2xl font-bold text-[#040741]">{step.title}</h2>
        </div>
        <p className="text-gray-600 leading-relaxed">{step.description}</p>
        <button
          onClick={() => onAction('start')}
          disabled={loading}
          className="w-full py-3 px-6 bg-[#313ADF] text-white rounded-xl font-semibold text-base hover:bg-[#2730c4] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {loading && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {loading
            ? step.id === 'welcome'
              ? 'Création des données de démo…'
              : 'Nettoyage en cours…'
            : step.buttonText}
        </button>
        {step.id === 'welcome' && !loading && (
          <button
            onClick={() => onAction('skip')}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Passer le tutoriel
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Floating tour panel ─────────────────────────────────────────────────────

function TourPanel({ step, stepIdx, onNext, onPrev, onSkip, onMinimize }) {
  const isFirst = stepIdx === 0
  const isLast = stepIdx === TOTAL_STEPS - 1
  const progress = Math.round(((stepIdx + 1) / TOTAL_STEPS) * 100)

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-[#313ADF] px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PulseBeacon color="#fff" />
          <span className="text-white text-xs font-semibold tracking-wide uppercase truncate">
            Tutoriel — {stepIdx + 1}/{TOTAL_STEPS}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onMinimize}
            title="Réduire"
            className="text-white/70 hover:text-white transition-colors p-1 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={onSkip}
            title="Quitter le tutoriel"
            className="text-white/70 hover:text-white transition-colors p-1 rounded"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-[#313ADF] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{step.emoji}</span>
          <h3 className="font-bold text-[#040741] text-base leading-tight">{step.title}</h3>
        </div>

        <p className="text-gray-600 text-sm leading-relaxed">{step.description}</p>

        {/* Instructions for interactive steps */}
        {step.interactive && step.instructions && (
          <div className="bg-[#313ADF]/5 border border-[#313ADF]/20 rounded-xl p-3">
            <p className="text-xs font-semibold text-[#313ADF] uppercase tracking-wide mb-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              À faire maintenant
            </p>
            <ol className="flex flex-col gap-1.5">
              {step.instructions.map((inst, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-700">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#313ADF] text-white flex items-center justify-center text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span>{inst}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Tip for non-interactive steps */}
        {!step.interactive && step.tip && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
            <span className="flex-shrink-0">💡</span>
            <p className="text-xs text-amber-800">{step.tip}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex gap-2">
        {!isFirst && (
          <button
            onClick={onPrev}
            className="flex-1 py-2 px-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            ← Préc.
          </button>
        )}

        {step.interactive ? (
          <button
            onClick={onNext}
            className="flex-1 py-2 px-3 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors"
          >
            {step.confirmText || 'J\'ai fait ça ✓'}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex-1 py-2 px-3 bg-[#313ADF] text-white rounded-xl text-sm font-semibold hover:bg-[#2730c4] transition-colors"
          >
            {isLast ? 'Terminer →' : 'Suivant →'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingTour() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentWorkspace } = useWorkspace()

  // phase: 'idle' | 'welcome' | 'touring' | 'done'
  const [phase, setPhase] = useState('idle')
  const [stepIdx, setStepIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [minimized, setMinimized] = useState(false)

  // ── Show on mount if needed ──
  useEffect(() => {
    if (!currentWorkspace) return
    if (shouldShowOnboarding()) {
      setPhase('welcome')
    }
  }, [currentWorkspace])

  // ── Auto-navigate when step changes ──
  useEffect(() => {
    if (phase !== 'touring') return
    const step = TOUR_STEPS[stepIdx]
    if (step?.route && location.pathname !== step.route) {
      navigate(step.route)
    }
  }, [phase, stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Welcome action ──
  const handleWelcomeAction = useCallback(
    async (action) => {
      if (action === 'skip') {
        await markOnboardingComplete(currentWorkspace?.owner_user_id)
        setPhase('idle')
        return
      }
      if (!currentWorkspace) return
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        await createTestData(currentWorkspace.id, user?.id)
      } catch (err) {
        console.error('[OnboardingTour] createTestData error:', err)
      } finally {
        setLoading(false)
        setStepIdx(0)
        setPhase('touring')
      }
    },
    [currentWorkspace]
  )

  // ── Navigation ──
  const goNext = useCallback(() => {
    if (stepIdx < TOUR_STEPS.length - 1) {
      setStepIdx((i) => i + 1)
      setMinimized(false)
    } else {
      setPhase('done')
    }
  }, [stepIdx])

  const goPrev = useCallback(() => {
    if (stepIdx > 0) {
      setStepIdx((i) => i - 1)
      setMinimized(false)
    }
  }, [stepIdx])

  // ── Skip ──
  const handleSkip = useCallback(async () => {
    if (!confirm('Quitter le tutoriel ? Les données de démonstration seront supprimées.')) return
    setLoading(true)
    try {
      if (currentWorkspace) await deleteTestData(currentWorkspace.id)
      await markOnboardingComplete(currentWorkspace?.owner_user_id)
    } catch (err) {
      console.error('[OnboardingTour] cleanup error:', err)
    } finally {
      setLoading(false)
      setPhase('idle')
    }
  }, [currentWorkspace])

  // ── Done ──
  const handleDoneAction = useCallback(async () => {
    setLoading(true)
    try {
      if (currentWorkspace) await deleteTestData(currentWorkspace.id)
      await markOnboardingComplete(currentWorkspace?.owner_user_id)
      navigate('/dashboard')
    } catch (err) {
      console.error('[OnboardingTour] cleanup error:', err)
    } finally {
      setLoading(false)
      setPhase('idle')
    }
  }, [currentWorkspace, navigate])

  if (phase === 'idle') return null

  if (phase === 'welcome') {
    return <TourModal step={STEPS[0]} onAction={handleWelcomeAction} loading={loading} />
  }

  if (phase === 'done') {
    return <TourModal step={STEPS[STEPS.length - 1]} onAction={handleDoneAction} loading={loading} />
  }

  // touring
  const currentStep = TOUR_STEPS[stepIdx]
  if (!currentStep) return null

  if (minimized) {
    return (
      <MinimisedPill
        stepIdx={stepIdx}
        onRestore={() => setMinimized(false)}
      />
    )
  }

  return (
    <TourPanel
      step={currentStep}
      stepIdx={stepIdx}
      onNext={goNext}
      onPrev={goPrev}
      onSkip={handleSkip}
      onMinimize={() => setMinimized(true)}
    />
  )
}
