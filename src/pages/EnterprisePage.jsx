import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FEATURES = [
  { icon: '🏪', title: 'Multi-magasins centralisé', desc: 'Gérez tous vos points de vente depuis un tableau de bord unique. Comparez les performances, consolidez les données.' },
  { icon: '👥', title: 'Équipes illimitées', desc: 'Ajoutez autant de membres que nécessaire. Gérez les rôles et accès de chaque magasin en un clic.' },
  { icon: '🤖', title: 'AI Neo illimitée', desc: 'Crédits Neo illimités pour toute l\'organisation. Agent IA avec accès à vos données en temps réel.' },
  { icon: '📊', title: 'Analytics consolidés', desc: 'CA total, commandes, livraisons — vue agrégée de tous vos sites avec comparatif inter-magasins.' },
  { icon: '🚚', title: 'Livraisons avancées', desc: 'App livreur mobile, tracking GPS temps réel, carte des tournées pour tous vos magasins.' },
  { icon: '🔧', title: 'Support dédié', desc: 'Intégration personnalisée, formation de vos équipes, SLA garanti et interlocuteur dédié.' },
]

const FAQ = [
  { q: 'Combien de magasins peut-on gérer ?', r: 'Le plan Enterprise est sur-mesure — le nombre de magasins est défini selon vos besoins lors de la négociation.' },
  { q: 'Y a-t-il une période d\'essai ?', r: 'Oui, nous proposons une démonstration guidée et un accès d\'essai de 30 jours pour votre équipe.' },
  { q: 'Qu\'est-ce qui change par rapport au plan Pro ?', r: 'Enterprise ajoute le multi-workspace centralisé, les équipes illimitées, les crédits Neo illimités, et un support dédié.' },
  { q: 'La facturation est-elle centralisée ?', r: 'Oui, un seul abonnement Stripe couvre tous vos workspaces rattachés au compte Enterprise.' },
]

export default function EnterprisePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    full_name: '', email: '', company_name: '', phone: '', nb_stores: '', message: ''
  })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [openFaq, setOpenFaq] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.full_name || !form.email) { setError('Nom et email requis.'); return }
    setSending(true)
    setError('')
    try {
      const { error: dbError } = await supabase
        .from('enterprise_contact_requests')
        .insert({
          full_name: form.full_name,
          email: form.email,
          company_name: form.company_name || null,
          phone: form.phone || null,
          nb_stores: form.nb_stores ? parseInt(form.nb_stores) : null,
          message: form.message || null,
        })
      if (dbError) throw dbError
      setSent(true)
    } catch (err) {
      setError('Erreur lors de l\'envoi. Réessayez ou contactez-nous directement.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-8 h-8 bg-gradient-to-br from-[#313ADF] to-[#040741] rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <span className="font-bold text-[#040741]">NeoFlow BOS</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/login')} className="text-sm font-medium text-gray-600 hover:text-[#313ADF] transition-colors">
            Se connecter
          </button>
          <a href="#contact" className="px-4 py-2 bg-[#313ADF] text-white rounded-xl text-sm font-semibold hover:bg-[#040741] transition-colors">
            Nous contacter
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#040741] via-[#1a1f6e] to-[#313ADF] text-white px-6 py-24 md:py-32">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/15 rounded-full text-sm font-medium mb-6">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Plan Enterprise — Sur devis
          </span>
          <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            NeoFlow BOS<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-300">pour les groupes</span>
          </h1>
          <p className="text-xl text-white/75 max-w-2xl mx-auto mb-10">
            Gérez plusieurs magasins depuis un seul tableau de bord. Équipes illimitées, AI Neo sans contrainte, analytics consolidés.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#contact"
              className="px-8 py-4 bg-white text-[#040741] rounded-2xl font-bold text-lg hover:bg-gray-100 transition-colors"
            >
              Demander une démo
            </a>
            <a href="#fonctionnalites"
              className="px-8 py-4 bg-white/15 text-white rounded-2xl font-bold text-lg hover:bg-white/25 transition-colors border border-white/20"
            >
              Voir les fonctionnalités
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-gray-50 px-6 py-12">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: 'Illimité', label: 'Membres par magasin' },
            { value: '∞', label: 'NeoCredits AI' },
            { value: 'N magasins', label: 'Multi-workspace' },
            { value: '1 facture', label: 'Abonnement centralisé' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-2xl font-black text-[#313ADF]">{s.value}</p>
              <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="px-6 py-20 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-black text-[#040741] mb-3">Tout ce dont un groupe a besoin</h2>
          <p className="text-gray-500 max-w-xl mx-auto">Conçu pour les enseignes multi-magasins qui ont besoin de centralisation sans complexité.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
              <span className="text-3xl mb-3 block">{f.icon}</span>
              <h3 className="text-base font-bold text-[#040741] mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparatif plans */}
      <section className="bg-gray-50 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-black text-[#040741] text-center mb-10">Enterprise vs Pro</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-3 bg-[#040741] text-white text-sm font-semibold">
              <div className="px-6 py-4">Fonctionnalité</div>
              <div className="px-6 py-4 text-center border-l border-white/10">Pro</div>
              <div className="px-6 py-4 text-center border-l border-white/10 bg-[#313ADF]">Enterprise</div>
            </div>
            {[
              ['Commandes / factures / devis', '✓ illimité', '✓ illimité'],
              ['Membres par workspace', '10 max', '✓ illimité'],
              ['Multi-workspace', '✗', '✓ centralisé'],
              ['AI Neo (NeoCredits)', '2 000 / mois', '✓ illimité'],
              ['Agent IA function calling', '✓', '✓'],
              ['SAV complet', '✓', '✓'],
              ['App livreur + GPS', '✓', '✓'],
              ['Analytics consolidés multi-sites', '✗', '✓'],
              ['Facturation unique', 'Par workspace', '✓ un seul abonnement'],
              ['Support', 'Standard', '✓ Dédié + SLA'],
              ['Prix', '49€ / mois', 'Sur devis'],
            ].map(([feature, pro, ent], i) => (
              <div key={i} className={`grid grid-cols-3 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <div className="px-6 py-3 text-gray-700 font-medium">{feature}</div>
                <div className="px-6 py-3 text-center border-l border-gray-100 text-gray-500">{pro}</div>
                <div className="px-6 py-3 text-center border-l border-gray-100 text-[#313ADF] font-semibold">{ent}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-black text-[#040741] text-center mb-8">Questions fréquentes</h2>
        <div className="space-y-3">
          {FAQ.map((item, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full text-left px-6 py-4 flex items-center justify-between font-semibold text-[#040741] hover:bg-gray-50 transition-colors"
              >
                <span>{item.q}</span>
                <svg className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {openFaq === i && (
                <div className="px-6 pb-4 text-sm text-gray-500 leading-relaxed border-t border-gray-50 pt-3">
                  {item.r}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Formulaire de contact */}
      <section id="contact" className="bg-gradient-to-br from-[#040741] to-[#313ADF] px-6 py-20">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-white mb-3">Parlons de votre projet</h2>
            <p className="text-white/70">Remplissez ce formulaire — nous vous recontactons sous 24h ouvrées.</p>
          </div>

          {sent ? (
            <div className="bg-white/15 border border-white/20 rounded-2xl p-8 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h3 className="text-xl font-bold text-white mb-2">Message reçu !</h3>
              <p className="text-white/70">Nous vous recontacterons à <strong>{form.email}</strong> sous 24h.</p>
              <button onClick={() => navigate('/')} className="mt-6 px-6 py-2.5 bg-white text-[#040741] rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors">
                Retour à l'accueil
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white/10 border border-white/20 rounded-2xl p-8 space-y-4 backdrop-blur-sm">
              {error && (
                <div className="bg-red-500/20 border border-red-400/30 text-red-200 rounded-xl px-4 py-3 text-sm">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-1.5">Nom complet *</label>
                  <input
                    type="text" value={form.full_name} required
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                    placeholder="Jean Dupont"
                  />
                </div>
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-1.5">Email professionnel *</label>
                  <input
                    type="email" value={form.email} required
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                    placeholder="jean@mongroupe.fr"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-1.5">Nom de l'enseigne</label>
                  <input
                    type="text" value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                    placeholder="Groupe Literie Express"
                  />
                </div>
                <div>
                  <label className="block text-white/80 text-sm font-medium mb-1.5">Téléphone</label>
                  <input
                    type="tel" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                    placeholder="+33 6 00 00 00 00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-1.5">Nombre de magasins</label>
                <select
                  value={form.nb_stores}
                  onChange={e => setForm(f => ({ ...f, nb_stores: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <option value="" className="bg-[#040741]">Sélectionner</option>
                  <option value="2" className="bg-[#040741]">2 magasins</option>
                  <option value="3" className="bg-[#040741]">3-5 magasins</option>
                  <option value="6" className="bg-[#040741]">6-10 magasins</option>
                  <option value="11" className="bg-[#040741]">Plus de 10</option>
                </select>
              </div>
              <div>
                <label className="block text-white/80 text-sm font-medium mb-1.5">Votre besoin</label>
                <textarea
                  value={form.message} rows={3}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 resize-none"
                  placeholder="Décrivez votre situation et vos besoins spécifiques..."
                />
              </div>
              <button
                type="submit" disabled={sending}
                className="w-full py-4 bg-white text-[#040741] rounded-xl font-bold text-base hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Envoi...
                  </>
                ) : 'Envoyer ma demande'}
              </button>
              <p className="text-white/40 text-xs text-center">
                En envoyant ce formulaire, vous acceptez d'être recontacté par l'équipe NeoFlow Agency.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#040741] text-white/50 px-6 py-8 text-center text-sm">
        <p>© {new Date().getFullYear()} NeoFlow Agency · <button onClick={() => navigate('/mentions-legales')} className="hover:text-white transition-colors">Mentions légales</button></p>
      </footer>
    </div>
  )
}
