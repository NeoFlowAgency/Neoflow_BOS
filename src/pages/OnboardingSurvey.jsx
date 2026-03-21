import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const QUESTIONS = [
  {
    id: 'discovery',
    text: 'Comment avez-vous découvert NeoFlow BOS ?',
    options: ['Réseaux sociaux', 'Bouche à oreille', 'Recherche web', 'Salon ou événement', 'Autre'],
  },
  {
    id: 'reason',
    text: 'Pourquoi avez-vous choisi NeoFlow BOS ?',
    options: ['Gestion complète', 'Prix attractif', 'Interface simple', 'Recommandé', 'Autre'],
  },
  {
    id: 'expectation',
    text: 'Quelle est votre principale attente ?',
    options: ['Gérer mes ventes', 'Suivre mon stock', 'Gérer mes livraisons', 'Statistiques', 'Autre'],
  },
]

export default function OnboardingSurvey() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)

  const current = QUESTIONS[step]
  const isLast = step === QUESTIONS.length - 1

  const handleSelect = (option) => {
    setAnswers((prev) => ({ ...prev, [current.id]: option }))
  }

  const handleNext = async () => {
    if (!answers[current.id]) return
    if (!isLast) {
      setStep((s) => s + 1)
      return
    }
    await saveSurvey()
  }

  const saveSurvey = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .update({ onboarding_survey: answers })
          .eq('id', user.id)
      }
    } catch {
      // Ignore survey save errors — non-bloquant
    } finally {
      setSaving(false)
      navigate('/onboarding/choice')
    }
  }

  const handleSkip = () => {
    navigate('/onboarding/choice')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040741] to-[#313ADF] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
            <span className="text-white font-bold text-2xl">N</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="h-1.5 bg-gray-100">
            <div
              className="h-full bg-gradient-to-r from-[#313ADF] to-[#5560f0] transition-all duration-500"
              style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>

          <div className="p-8">
            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-6">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i <= step ? 'bg-[#313ADF]' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            {/* Question */}
            <h2 className="text-xl font-bold text-[#040741] mb-6 leading-snug">
              {current.text}
            </h2>

            {/* Options */}
            <div className="space-y-2.5 mb-8">
              {current.options.map((option) => {
                const selected = answers[current.id] === option
                return (
                  <button
                    key={option}
                    onClick={() => handleSelect(option)}
                    className={`w-full text-left px-5 py-3.5 rounded-xl border-2 font-medium text-sm transition-all ${
                      selected
                        ? 'border-[#313ADF] bg-[#313ADF]/5 text-[#313ADF]'
                        : 'border-gray-200 text-gray-700 hover:border-[#313ADF]/40 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`inline-block w-4 h-4 rounded-full border-2 mr-3 align-middle transition-colors ${
                      selected ? 'border-[#313ADF] bg-[#313ADF]' : 'border-gray-300'
                    }`} />
                    {option}
                  </button>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Passer
              </button>
              <button
                onClick={handleNext}
                disabled={!answers[current.id] || saving}
                className="px-6 py-2.5 bg-[#313ADF] text-white rounded-xl font-semibold text-sm hover:bg-[#4149e8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {saving ? 'Envoi...' : isLast ? 'Terminer' : 'Suivant'}
                {!saving && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-white/50 text-xs mt-4">
          Question {step + 1} sur {QUESTIONS.length} · Non obligatoire
        </p>
      </div>
    </div>
  )
}
