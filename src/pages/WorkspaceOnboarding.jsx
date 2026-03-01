import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createWorkspace, createCheckoutSession, isStripeEnabled } from '../services/workspaceService'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { translateError } from '../lib/errorMessages'
import BackgroundPattern from '../components/ui/BackgroundPattern'

const LEGAL_FORMS = ['SAS', 'SARL', 'EURL', 'SCI', 'Auto-entrepreneur', 'SA', 'SNC', 'Autre']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF']
const COUNTRIES = ['France', 'Belgique', 'Suisse', 'Luxembourg', 'Canada', 'Autre']

const STEPS = [
  { id: 1, label: 'Infos générales' },
  { id: 2, label: 'Infos légales' },
  { id: 3, label: 'Documents' },
  { id: 4, label: 'Situation' },
  { id: 5, label: 'Abonnement' },
]

export default function WorkspaceOnboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentWorkspace } = useWorkspace()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const plan = 'standard'

  const [form, setForm] = useState({
    // Step 1
    name: '',
    description: '',
    address: '',
    postal_code: '',
    city: '',
    country: 'France',
    currency: 'EUR',
    phone: '',
    email: '',
    website: '',
    // Step 2
    siret: '',
    vat_number: '',
    legal_form: 'SAS',
    bank_iban: '',
    bank_bic: '',
    bank_account_holder: '',
    // Step 3
    payment_terms: '',
    invoice_footer: '',
    quote_footer: '',
    // Step 4
    nb_employes: '',
    ca_annuel_estime: '',
    surface_magasin: '',
    specialite: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  const checkoutCanceled = searchParams.get('checkout') === 'canceled'

  useEffect(() => {
    if (currentWorkspace?.is_active) {
      navigate('/dashboard', { replace: true })
    }
  }, [currentWorkspace, navigate])

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Le logo doit être au format PNG ou JPEG')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Le logo ne doit pas dépasser 2 Mo')
      return
    }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setError('')
  }

  const validateStep = (s) => {
    if (s === 1) {
      if (!form.name.trim() || form.name.trim().length < 2) return 'Le nom du workspace doit contenir au moins 2 caractères'
      if (!form.address.trim() || form.address.trim().length < 5) return 'Veuillez entrer une adresse valide'
      if (!form.postal_code.trim()) return 'Veuillez entrer un code postal'
      if (!form.city.trim() || form.city.trim().length < 2) return 'Veuillez entrer une ville'
    }
    if (s === 2) {
      if (!form.siret.trim() || !/^\d{14}$/.test(form.siret.replace(/\s/g, ''))) return 'Le SIRET doit contenir exactement 14 chiffres'
      if (form.vat_number && !/^FR\w{2}\d{9}$/.test(form.vat_number.replace(/\s/g, ''))) return 'Le numéro TVA doit être au format FR + 2 caractères + 9 chiffres'
    }
    return null
  }

  const handleNext = () => {
    const err = validateStep(step)
    if (err) { setError(err); return }
    setError('')
    setStep(s => s + 1)
  }

  const handlePrev = () => {
    setError('')
    setStep(s => s - 1)
  }

  const handleSkipStep = () => {
    setError('')
    setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Utilisateur non authentifié')

      let logoUrl = null
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const fileName = `${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('workspace-logos')
          .upload(fileName, logoFile, { contentType: logoFile.type })
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('workspace-logos')
            .getPublicUrl(fileName)
          logoUrl = publicUrl
        }
      }

      const workspace = await createWorkspace(form.name.trim(), user.id, {
        description: form.description.trim() || null,
        address: form.address.trim(),
        postal_code: form.postal_code.trim(),
        city: form.city.trim(),
        country: form.country,
        currency: form.currency,
        siret: form.siret.replace(/\s/g, ''),
        vat_number: form.vat_number.replace(/\s/g, '') || null,
        legal_form: form.legal_form,
        logo_url: logoUrl,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        bank_iban: form.bank_iban.replace(/\s/g, '') || null,
        bank_bic: form.bank_bic.replace(/\s/g, '') || null,
        bank_account_holder: form.bank_account_holder.trim() || null,
        payment_terms: form.payment_terms.trim() || null,
        invoice_footer: form.invoice_footer.trim() || null,
        quote_footer: form.quote_footer.trim() || null,
        nb_employes: form.nb_employes ? parseInt(form.nb_employes, 10) : null,
        ca_annuel_estime: form.ca_annuel_estime ? parseFloat(form.ca_annuel_estime) : null,
        surface_magasin: form.surface_magasin ? parseInt(form.surface_magasin, 10) : null,
        specialite: form.specialite.trim() || null,
      })

      if (isStripeEnabled()) {
        const { url } = await createCheckoutSession(workspace.id, undefined, undefined, plan)
        window.location.href = url
      } else {
        window.location.href = '/dashboard'
      }
    } catch (err) {
      console.error('Erreur création workspace:', err.message, err)
      setError(err.message || translateError(err))
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[#040741] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#313ADF]/30 focus:border-[#313ADF] transition-all"
  const labelClass = "block text-sm font-semibold text-[#040741] mb-2"

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BackgroundPattern />

      <div className="mb-6 relative z-10">
        <img src="/logo-neoflow.png" alt="Neoflow Agency" className="h-16 object-contain" />
      </div>

      <div className="w-full max-w-2xl bg-white border-2 border-[#040741] rounded-3xl shadow-xl relative z-10 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100">
          <div
            className="h-full bg-gradient-to-r from-[#313ADF] to-[#5560f0] transition-all duration-500"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          {STEPS.map((s) => (
            <div key={s.id} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s.id < step ? 'bg-green-500 text-white' :
                s.id === step ? 'bg-[#313ADF] text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {s.id < step ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : s.id}
              </div>
              <span className={`text-[10px] font-medium hidden sm:block ${s.id === step ? 'text-[#313ADF]' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <div className="px-6 md:px-10 pb-8 pt-4">
          {checkoutCanceled && step === 5 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Le paiement a été annulé. Complétez les étapes pour réessayer.
            </div>
          )}

          {/* ── STEP 1 : Infos générales ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#040741] mb-4">Informations générales</h2>
              <div>
                <label className={labelClass}>Nom du workspace *</label>
                <input type="text" value={form.name} onChange={e => updateForm('name', e.target.value)}
                  placeholder="Ex: Literie Dupont" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea value={form.description} onChange={e => updateForm('description', e.target.value)}
                  placeholder="Décrivez votre activité..." rows={2} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Adresse *</label>
                <input type="text" value={form.address} onChange={e => updateForm('address', e.target.value)}
                  placeholder="15 rue des Lilas" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Code postal *</label>
                  <input type="text" value={form.postal_code} onChange={e => updateForm('postal_code', e.target.value)}
                    placeholder="75001" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Ville *</label>
                  <input type="text" value={form.city} onChange={e => updateForm('city', e.target.value)}
                    placeholder="Paris" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Pays</label>
                  <select value={form.country} onChange={e => updateForm('country', e.target.value)} className={inputClass}>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Devise</label>
                  <select value={form.currency} onChange={e => updateForm('currency', e.target.value)} className={inputClass}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Téléphone</label>
                  <input type="tel" value={form.phone} onChange={e => updateForm('phone', e.target.value)}
                    placeholder="01 23 45 67 89" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Email professionnel</label>
                  <input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)}
                    placeholder="contact@boutique.fr" className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2 : Infos légales ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#040741] mb-4">Informations légales</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>SIRET *</label>
                  <input type="text" value={form.siret}
                    onChange={e => updateForm('siret', e.target.value.replace(/\D/g, '').slice(0, 14))}
                    placeholder="12345678900012" maxLength={14} className={inputClass} />
                  <p className="text-xs text-gray-400 mt-1">14 chiffres</p>
                </div>
                <div>
                  <label className={labelClass}>Numéro TVA</label>
                  <input type="text" value={form.vat_number}
                    onChange={e => updateForm('vat_number', e.target.value.toUpperCase())}
                    placeholder="FR12345678901" className={inputClass} />
                  <p className="text-xs text-gray-400 mt-1">Optionnel</p>
                </div>
              </div>
              <div>
                <label className={labelClass}>Forme juridique *</label>
                <select value={form.legal_form} onChange={e => updateForm('legal_form', e.target.value)} className={inputClass}>
                  {LEGAL_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-3">Coordonnées bancaires (optionnel)</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>IBAN</label>
                    <input type="text" value={form.bank_iban}
                      onChange={e => updateForm('bank_iban', e.target.value.toUpperCase())}
                      placeholder="FR76 1234..." className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>BIC / SWIFT</label>
                    <input type="text" value={form.bank_bic}
                      onChange={e => updateForm('bank_bic', e.target.value.toUpperCase())}
                      placeholder="BNPAFRPP" className={inputClass} />
                  </div>
                </div>
                <div className="mt-4">
                  <label className={labelClass}>Titulaire du compte</label>
                  <input type="text" value={form.bank_account_holder}
                    onChange={e => updateForm('bank_account_holder', e.target.value)}
                    placeholder="Mon Entreprise SAS" className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3 : Personnalisation documents (optionnel) ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-[#040741]">Personnalisation documents</h2>
                  <p className="text-sm text-gray-500 mt-1">Optionnel — modifiable plus tard dans les paramètres</p>
                </div>
              </div>
              <div>
                <label className={labelClass}>Logo</label>
                <div className="flex items-center gap-3">
                  {logoPreview && (
                    <img src={logoPreview} alt="Logo preview" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
                  )}
                  <label className="flex-1 cursor-pointer">
                    <div className="bg-gray-50 border border-gray-200 border-dashed rounded-xl px-4 py-3 text-center text-sm text-gray-500 hover:border-[#313ADF] hover:text-[#313ADF] transition-colors">
                      {logoFile ? logoFile.name : 'Choisir un fichier (PNG, JPEG, max 2 Mo)'}
                    </div>
                    <input type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} className="hidden" />
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClass}>Conditions de paiement (CGV)</label>
                <textarea value={form.payment_terms} onChange={e => updateForm('payment_terms', e.target.value)}
                  placeholder="Ex: Paiement à 30 jours. Pénalités de retard : 3x taux légal."
                  rows={3} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Pied de page factures</label>
                <textarea value={form.invoice_footer} onChange={e => updateForm('invoice_footer', e.target.value)}
                  placeholder="Texte libre en bas de vos factures..." rows={2} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Pied de page devis</label>
                <textarea value={form.quote_footer} onChange={e => updateForm('quote_footer', e.target.value)}
                  placeholder="Texte libre en bas de vos devis..." rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>
          )}

          {/* ── STEP 4 : Situation du magasin (optionnel) ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-[#040741]">Situation du magasin</h2>
                <p className="text-sm text-gray-500 mt-1">Optionnel — nous aide à adapter NeoFlow à votre profil</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Nombre d'employés</label>
                  <input type="number" min={1} value={form.nb_employes} onChange={e => updateForm('nb_employes', e.target.value)}
                    placeholder="5" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>CA estimé (€/an)</label>
                  <input type="number" min={0} value={form.ca_annuel_estime} onChange={e => updateForm('ca_annuel_estime', e.target.value)}
                    placeholder="150000" className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Surface du magasin (m²)</label>
                  <input type="number" min={0} value={form.surface_magasin} onChange={e => updateForm('surface_magasin', e.target.value)}
                    placeholder="120" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Spécialité</label>
                  <input type="text" value={form.specialite} onChange={e => updateForm('specialite', e.target.value)}
                    placeholder="Ex: Literie, Canapés, Cuisines..." className={inputClass} />
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5 : Abonnement ── */}
          {step === 5 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-[#040741] mb-4">Finaliser et s'abonner</h2>

              <div className="bg-gradient-to-br from-[#040741] to-[#313ADF] rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                    <span className="text-2xl font-bold">N</span>
                  </div>
                  <div>
                    <p className="font-bold text-lg">NeoFlow BOS</p>
                    <p className="text-white/70 text-sm">Système de gestion complet</p>
                  </div>
                </div>
                <div className="text-3xl font-bold mb-1">49,99 €<span className="text-lg font-normal text-white/70">/mois</span></div>
                <p className="text-white/70 text-sm">7 jours d'essai gratuit · Sans engagement · CB requise</p>
                <ul className="mt-4 space-y-2">
                  {['Commandes & factures illimitées', 'Gestion des stocks', 'Livraisons & clients', 'Neo IA assistant', 'Statistiques avancées'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-emerald-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                <p className="font-semibold text-[#040741] mb-2">Récapitulatif :</p>
                <p>Workspace : <span className="font-medium">{form.name}</span></p>
                {form.siret && <p>SIRET : <span className="font-medium">{form.siret}</span></p>}
                <p>Ville : <span className="font-medium">{form.city}, {form.country}</span></p>
              </div>

              {!isStripeEnabled() && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm">
                  Mode développement — Stripe non configuré. Le workspace sera créé directement.
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 ? (
              <button onClick={handlePrev} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Précédent
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              {(step === 3 || step === 4) && (
                <button onClick={handleSkipStep} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  Passer cette étape
                </button>
              )}

              {step < 5 ? (
                <button
                  onClick={handleNext}
                  className="px-6 py-2.5 bg-[#313ADF] text-white rounded-xl font-semibold text-sm hover:bg-[#4149e8] transition-colors flex items-center gap-2"
                >
                  Suivant
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#040741] to-[#313ADF] text-white rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {isStripeEnabled() ? 'Redirection...' : 'Création...'}
                    </>
                  ) : isStripeEnabled() ? 'Créer et souscrire' : 'Créer mon workspace'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 relative z-10">
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
          className="text-gray-400 hover:text-red-500 text-sm font-medium transition-colors flex items-center gap-2 mx-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Se déconnecter
        </button>
      </div>
      <p className="mt-3 text-gray-400 text-sm relative z-10">Propulsé par Neoflow Agency</p>
    </div>
  )
}
