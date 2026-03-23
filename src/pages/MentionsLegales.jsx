import { Link } from 'react-router-dom'
import BackgroundPattern from '../components/ui/BackgroundPattern'

export default function MentionsLegales() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center p-4 md:p-8 relative overflow-hidden">
      <BackgroundPattern />

      <div className="w-full max-w-3xl relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 mt-4">
          <Link to="/login" className="flex items-center gap-2 text-[#313ADF] hover:underline text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour
          </Link>
          <img src="/logo-neoflow.png" alt="Neoflow Agency" className="h-10 object-contain" />
        </div>

        <div className="bg-white border-2 border-[#040741] rounded-3xl p-6 md:p-10 shadow-xl">
          <h1 className="text-2xl md:text-3xl font-bold text-[#040741] mb-2">Mentions légales</h1>
          <p className="text-gray-500 text-sm mb-8">Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN)</p>

          <div className="space-y-8 text-[#040741] text-sm leading-relaxed">

            <section className="space-y-2">
              <h2 className="text-base font-bold">1. Éditeur du service</h2>
              <div className="text-gray-600 space-y-1">
                <p><strong>Dénomination sociale :</strong> Neoflow Agency</p>
                <p><strong>Forme juridique :</strong> <span className="text-amber-600 italic">[À compléter : Auto-entrepreneur / SASU / SARL…]</span></p>
                <p><strong>Capital social :</strong> <span className="text-amber-600 italic">[À compléter]</span></p>
                <p><strong>SIRET :</strong> <span className="text-amber-600 italic">[À compléter]</span></p>
                <p><strong>Numéro TVA intracommunautaire :</strong> <span className="text-amber-600 italic">[À compléter ou N/A si franchise]</span></p>
                <p><strong>Adresse du siège social :</strong> <span className="text-amber-600 italic">[À compléter]</span></p>
                <p><strong>Email de contact :</strong>{' '}
                  <a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">
                    contacte.neoflowagency@gmail.com
                  </a>
                </p>
                <p><strong>Directeur de la publication :</strong> <span className="text-amber-600 italic">[Prénom Nom — dirigeant de Neoflow Agency]</span></p>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">2. Hébergement</h2>
              <div className="text-gray-600 space-y-3">
                <div>
                  <p className="font-medium">Application web — Vercel Inc.</p>
                  <p>340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis</p>
                  <p>Site : www.vercel.com</p>
                </div>
                <div>
                  <p className="font-medium">Base de données et authentification — Supabase Inc.</p>
                  <p>970 Toa Payoh North #07-04, Singapore 318992</p>
                  <p>Site : www.supabase.com</p>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">3. Propriété intellectuelle</h2>
              <p className="text-gray-600">
                L'ensemble des contenus présents sur NeoFlow BOS (code source, interface, textes, images, logos,
                base de données) est la propriété exclusive de Neoflow Agency et est protégé par les lois françaises
                et internationales relatives à la propriété intellectuelle. Toute reproduction, représentation,
                modification ou exploitation non expressément autorisée est strictement interdite et constitue une
                contrefaçon sanctionnée par les articles L335-2 et suivants du Code de la propriété intellectuelle.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">4. Protection des données personnelles (RGPD)</h2>
              <p className="text-gray-600">
                Neoflow Agency traite des données à caractère personnel dans le cadre de la fourniture du service
                NeoFlow BOS. Ces traitements sont effectués conformément au Règlement (UE) 2016/679 (RGPD)
                et à la loi n° 78-17 du 6 janvier 1978 modifiée (loi Informatique et Libertés).
              </p>
              <p className="text-gray-600">
                Pour toute information sur nos pratiques en matière de données personnelles, veuillez consulter
                notre <Link to="/cgu" className="text-[#313ADF] hover:underline">Politique de confidentialité</Link>.
              </p>
              <p className="text-gray-600">
                Pour exercer vos droits (accès, rectification, suppression, portabilité, opposition), contactez :
                {' '}<a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">
                  contacte.neoflowagency@gmail.com
                </a>. Vous pouvez également adresser une réclamation à la{' '}
                <strong>CNIL</strong> (www.cnil.fr).
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">5. Cookies</h2>
              <p className="text-gray-600">
                NeoFlow BOS utilise uniquement des cookies techniques strictement nécessaires à son fonctionnement
                (authentification, session). Aucun cookie publicitaire, de suivi ou d'analyse tiers n'est utilisé.
                Voir notre <Link to="/cgu" className="text-[#313ADF] hover:underline">Politique de cookies</Link>.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">6. Limitation de responsabilité</h2>
              <p className="text-gray-600">
                Neoflow Agency s'efforce de fournir un service fiable et sécurisé. Toutefois, l'Éditeur ne peut
                garantir l'absence totale d'erreurs, d'interruptions ou de pertes de données. L'utilisation du
                service se fait sous la responsabilité de l'utilisateur.
              </p>
              <p className="text-gray-600">
                <strong>Notice NF 525 :</strong> NeoFlow BOS est un logiciel de gestion commerciale.
                La fonctionnalité de vente rapide est fournie à titre de gestion interne et ne constitue pas
                un logiciel de caisse certifié au sens de l'article 286 bis du Code Général des Impôts.
                Chaque utilisateur est seul responsable du respect de ses obligations légales en matière
                d'enregistrement des encaissements.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">7. Conditions générales</h2>
              <p className="text-gray-600">
                L'utilisation de NeoFlow BOS est soumise aux{' '}
                <Link to="/cgu" className="text-[#313ADF] hover:underline">
                  Conditions Générales d'Utilisation et de Vente
                </Link>{' '}
                disponibles sur cette application.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">8. Droit applicable</h2>
              <p className="text-gray-600">
                Les présentes mentions légales sont régies par le droit français. En cas de litige relatif
                à l'interprétation ou à l'exécution des présentes, les tribunaux français seront seuls compétents.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold">9. Contact</h2>
              <p className="text-gray-600">
                Pour toute question relative aux présentes mentions légales :{' '}
                <a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">
                  contacte.neoflowagency@gmail.com
                </a>
              </p>
            </section>

          </div>
        </div>

        <p className="mt-8 text-gray-400 text-sm text-center">
          Propulsé par Neoflow Agency ·{' '}
          <Link to="/cgu" className="hover:text-[#313ADF] transition-colors">CGU / CGV</Link>
        </p>
      </div>
    </div>
  )
}
