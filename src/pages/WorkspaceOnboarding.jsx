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

export default function WorkspaceOnboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentWorkspace } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [wsLimitReached, setWsLimitReached] = useState(false)
  const plan = sessionStorage.getItem('neoflow_plan')

  // Check workspace limit for early access (max 3)
  useEffect(() => {
    if (plan === 'early-access') {
      const checkLimit = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
          .from('workspace_users')
          .select('workspace_id')
          .eq('user_id', user.id)
          .eq('role', 'proprietaire')
        if (data && data.length >= 3) {
          setWsLimitReached(true)
        }
      }
      checkLimit()
    }
  }, [plan])

  // Create mode state
  const [form, setForm] = useState({
    name: '',
    description: '',
    address: '',
    postal_code: '',
    city: '',
    country: 'France',
    currency: 'EUR',
    siret: '',
    vat_number: '',
    legal_form: 'SAS',
    phone: '',
    email: '',
    website: '',
    bank_iban: '',
    bank_bic: '',
    bank_account_holder: '',
    payment_terms: '',
    invoice_footer: '',
    quote_footer: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  // Handle checkout canceled redirect
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

  const validateCreate = () => {
    if (!form.name.trim() || form.name.trim().length < 2) return 'Le nom du workspace doit contenir au moins 2 caractères'
    if (!form.address.trim() || form.address.trim().length < 5) return 'Veuillez entrer une adresse valide'
    if (!form.postal_code.trim()) return 'Veuillez entrer un code postal'
    if (!form.city.trim() || form.city.trim().length < 2) return 'Veuillez entrer une ville'
    if (!form.siret.trim() || !/^\d{14}$/.test(form.siret.replace(/\s/g, ''))) return 'Le SIRET doit contenir exactement 14 chiffres'
    if (form.vat_number && !/^FR\w{2}\d{9}$/.test(form.vat_number.replace(/\s/g, ''))) return 'Le numéro TVA doit être au format FR + 2 caractères + 9 chiffres'
    return null
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')

    const validationError = validateCreate()
    if (validationError) {
      setError(validationError)
      return
    }

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
      })

      // Redirect to Stripe Checkout if Stripe is configured, otherwise go to dashboard
      if (isStripeEnabled()) {
        const { url } = await createCheckoutSession(workspace.id, undefined, undefined, plan)
        window.location.href = url
      } else {
        // Force full reload so WorkspaceContext picks up the new workspace
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

      <div className="mb-8 relative z-10">
        <img
          src="/logo-neoflow.png"
          alt="Neoflow Agency"
          className="h-20 object-contain"
        />
      </div>

      <div className="w-full max-w-2xl bg-white border-2 border-[#040741] rounded-3xl p-6 md:p-10 shadow-xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#313ADF]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#313ADF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#040741]">Créer votre workspace</h1>
          <p className="text-gray-500 mt-2">
            Renseignez les informations de votre entreprise pour commencer
          </p>
        </div>

        {wsLimitReached && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">Limite atteinte</span>
            </div>
            <p>Vous avez atteint la limite de 3 workspaces en acces anticipe. Pour en creer davantage, veuillez contacter le support a <a href="mailto:contacte.neoflowbos@gmail.com" className="underline font-medium">contacte.neoflowbos@gmail.com</a>.</p>
          </div>
        )}

        {checkoutCanceled && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Le paiement a été annulé. Vous pouvez réessayer en créant votre workspace ci-dessous.
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-5">
          {/* Section: Informations générales */}
          <div className="border-b border-gray-100 pb-5">
            <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-4">Informations générales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Nom du workspace *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="Ex: Ma Boutique, Mon Entreprise..."
                  required
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm('description', e.target.value)}
                  placeholder="Décrivez votre activité..."
                  rows={2}
                  maxLength={500}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          </div>

          {/* Section: Adresse */}
          <div className="border-b border-gray-100 pb-5">
            <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-4">Adresse</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Adresse *</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => updateForm('address', e.target.value)}
                  placeholder="15 rue des Lilas"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Code postal *</label>
                <input
                  type="text"
                  value={form.postal_code}
                  onChange={(e) => updateForm('postal_code', e.target.value)}
                  placeholder="75001"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Ville *</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => updateForm('city', e.target.value)}
                  placeholder="Paris"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Pays *</label>
                <select
                  value={form.country}
                  onChange={(e) => updateForm('country', e.target.value)}
                  className={inputClass}
                >
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Devise *</label>
                <select
                  value={form.currency}
                  onChange={(e) => updateForm('currency', e.target.value)}
                  className={inputClass}
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Informations légales */}
          <div className="border-b border-gray-100 pb-5">
            <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-4">Informations légales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>SIRET *</label>
                <input
                  type="text"
                  value={form.siret}
                  onChange={(e) => updateForm('siret', e.target.value.replace(/\D/g, '').slice(0, 14))}
                  placeholder="123 456 789 00012"
                  required
                  maxLength={14}
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">14 chiffres</p>
              </div>
              <div>
                <label className={labelClass}>Numéro TVA</label>
                <input
                  type="text"
                  value={form.vat_number}
                  onChange={(e) => updateForm('vat_number', e.target.value.toUpperCase())}
                  placeholder="FR12345678901"
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">Optionnel - Format: FR + 11 caractères</p>
              </div>
              <div>
                <label className={labelClass}>Forme juridique *</label>
                <select
                  value={form.legal_form}
                  onChange={(e) => updateForm('legal_form', e.target.value)}
                  className={inputClass}
                >
                  {LEGAL_FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
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
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Contact (optionnel) */}
          <div className="border-b border-gray-100 pb-5">
            <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-1">Contact</h3>
            <p className="text-xs text-gray-400 mb-4">Optionnel - Affiche sur vos documents</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Telephone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                  placeholder="01 23 45 67 89"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email professionnel</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value)}
                  placeholder="contact@monentreprise.fr"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Site web</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => updateForm('website', e.target.value)}
                  placeholder="https://www.monentreprise.fr"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Section: Informations bancaires (optionnel) */}
          <div className="border-b border-gray-100 pb-5">
            <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-1">Informations bancaires</h3>
            <p className="text-xs text-gray-400 mb-4">Optionnel - Pour afficher vos coordonnees bancaires sur les factures</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>IBAN</label>
                <input
                  type="text"
                  value={form.bank_iban}
                  onChange={(e) => updateForm('bank_iban', e.target.value.toUpperCase())}
                  placeholder="FR76 1234 5678 9012 3456 7890 123"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>BIC / SWIFT</label>
                <input
                  type="text"
                  value={form.bank_bic}
                  onChange={(e) => updateForm('bank_bic', e.target.value.toUpperCase())}
                  placeholder="BNPAFRPP"
                  className={inputClass}
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Titulaire du compte</label>
                <input
                  type="text"
                  value={form.bank_account_holder}
                  onChange={(e) => updateForm('bank_account_holder', e.target.value)}
                  placeholder="Mon Entreprise SAS"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Section: Personnalisation documents (optionnel) */}
          <div className="border-b border-gray-100 pb-5">
            <h3 className="text-sm font-bold text-[#313ADF] uppercase tracking-wide mb-1">Personnalisation documents</h3>
            <p className="text-xs text-gray-400 mb-4">Optionnel - Textes affiches en bas de vos factures et devis</p>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Conditions de paiement</label>
                <textarea
                  value={form.payment_terms}
                  onChange={(e) => updateForm('payment_terms', e.target.value)}
                  placeholder="Ex: Paiement a 30 jours. Penalites de retard : 3x taux legal."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div>
                <label className={labelClass}>Pied de page factures</label>
                <textarea
                  value={form.invoice_footer}
                  onChange={(e) => updateForm('invoice_footer', e.target.value)}
                  placeholder="Texte libre en bas de vos factures..."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div>
                <label className={labelClass}>Pied de page devis</label>
                <textarea
                  value={form.quote_footer}
                  onChange={(e) => updateForm('quote_footer', e.target.value)}
                  placeholder="Texte libre en bas de vos devis..."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          </div>

          {/* Pricing info - only show when Stripe is configured */}
          {isStripeEnabled() && (
            <div className={`${plan === 'early-access' ? 'bg-gradient-to-r from-[#313ADF]/10 to-purple-50 border-[#313ADF]/30' : 'bg-[#313ADF]/5 border-[#313ADF]/20'} border rounded-xl p-4`}>
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-[#313ADF] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={plan === 'early-access' ? "M13 10V3L4 14h7v7l9-11h-7z" : "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"} />
                </svg>
                <div>
                  {plan === 'early-access' ? (
                    <>
                      <p className="text-sm font-semibold text-[#040741]">Acces Anticipe NeoFlow BOS - Paiement unique</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Paiement unique. Acces complet a partir du 25 fevrier 2026. Carte bancaire requise.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-[#040741]">Abonnement NeoFlow BOS - 49,99 EUR/mois</p>
                      <p className="text-xs text-gray-500 mt-1">
                        7 jours d'essai gratuit. Carte bancaire requise. Annulable a tout moment depuis vos parametres.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

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
            disabled={loading || wsLimitReached}
            className="w-full bg-gradient-to-r from-[#040741] to-[#313ADF] text-white py-4 rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {isStripeEnabled() ? 'Redirection vers le paiement...' : 'Création en cours...'}
              </span>
            ) : isStripeEnabled() ? (plan === 'early-access' ? "Creer et payer l'acces" : 'Créer et souscrire') : 'Créer mon workspace'}
          </button>
        </form>
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
