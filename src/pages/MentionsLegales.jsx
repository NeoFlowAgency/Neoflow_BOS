import { useNavigate } from 'react-router-dom'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function MentionsLegales() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-4 md:p-8 relative overflow-hidden">
      <BackgroundPattern />

      <div className="w-full max-w-3xl relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 mt-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[#313ADF] hover:underline text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour
          </button>
          <img src="/logo-neoflow.png" alt="Neoflow Agency" className="h-10 object-contain" />
        </div>

        {/* Content */}
        <div className="bg-white border-2 border-[#040741] rounded-3xl p-6 md:p-10 shadow-xl">
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-8">Mentions Legales</h1>

          <div className="space-y-6 text-[#040741] text-sm leading-relaxed">
            <section>
              <h2 className="text-lg font-bold mb-2">1. Editeur du site</h2>
              <p>
                Le site NeoFlow BOS est edite par <strong>Neoflow Agency</strong>.
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Email de contact : <a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">contacte.neoflowagency@gmail.com</a></li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold mb-2">2. Hebergement</h2>
              <p className="text-gray-600">
                Le site est heberge par Vercel Inc. et les donnees sont stockees par Supabase Inc.
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Vercel Inc. - 340 S Lemon Ave #4133, Walnut, CA 91789, USA</li>
                <li>Supabase Inc. - 970 Toa Payoh North #07-04, Singapore 318992</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold mb-2">3. Protection des donnees personnelles</h2>
              <p className="text-gray-600">
                Conformement au Reglement General sur la Protection des Donnees (RGPD) et a la loi Informatique et Libertes, vous disposez d'un droit d'acces, de rectification, de suppression et de portabilite de vos donnees personnelles.
              </p>
              <p className="text-gray-600 mt-2">
                Les donnees collectees sont les suivantes :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-gray-600">
                <li>Nom complet et adresse email (inscription)</li>
                <li>Informations de l'entreprise (workspace : SIRET, adresse, etc.)</li>
                <li>Donnees de facturation (factures, devis, clients)</li>
              </ul>
              <p className="text-gray-600 mt-2">
                Ces donnees sont stockees de maniere securisee et ne sont pas partagees avec des tiers, sauf obligation legale.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold mb-2">4. Cookies</h2>
              <p className="text-gray-600">
                Le site utilise uniquement des cookies techniques necessaires a son fonctionnement (authentification, session). Aucun cookie publicitaire ou de tracking n'est utilise.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold mb-2">5. Propriete intellectuelle</h2>
              <p className="text-gray-600">
                L'ensemble des contenus presents sur le site NeoFlow BOS (textes, images, logos, logiciels) sont la propriete exclusive de Neoflow Agency. Toute reproduction non autorisee est interdite.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold mb-2">6. Limitation de responsabilite</h2>
              <p className="text-gray-600">
                Neoflow Agency s'efforce de fournir un service fiable et securise. Toutefois, nous ne pouvons garantir l'absence totale d'erreurs ou d'interruptions. L'utilisation du service se fait sous la responsabilite de l'utilisateur.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-bold mb-2">7. Contact</h2>
              <p className="text-gray-600">
                Pour toute question relative aux presentes mentions legales, vous pouvez nous contacter a l'adresse : <a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">contacte.neoflowagency@gmail.com</a>
              </p>
            </section>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-gray-400 text-sm text-center">
          Propulse par Neoflow Agency
        </p>
      </div>
    </div>
  )
}
