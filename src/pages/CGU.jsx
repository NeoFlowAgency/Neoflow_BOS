import { useState } from 'react'
import { Link } from 'react-router-dom'
import BackgroundPattern from '../components/ui/BackgroundPattern'

const TABS = [
  { id: 'cgu', label: 'CGU' },
  { id: 'cgv', label: 'CGV' },
  { id: 'confidentialite', label: 'Confidentialité' },
  { id: 'cookies', label: 'Cookies' },
]

const Section = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-base font-bold text-[#040741]">{title}</h2>
    <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
  </section>
)

function TabCGU() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Dernière mise à jour : mars 2025</p>

      <Section title="1. Objet">
        <p>
          Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de l'application
          NeoFlow BOS, logiciel de gestion commerciale en mode SaaS, éditée par <strong>Neoflow Agency</strong>
          (ci-après « l'Éditeur »). En créant un compte, l'utilisateur accepte sans réserve les présentes CGU.
        </p>
      </Section>

      <Section title="2. Accès au service">
        <p>
          L'accès au service nécessite la création d'un compte avec une adresse email valide et un mot de passe
          sécurisé (minimum 8 caractères). L'utilisateur est seul responsable de la confidentialité de ses identifiants.
        </p>
        <p>
          L'Éditeur se réserve le droit de suspendre ou de supprimer tout compte en cas de violation des présentes CGU,
          d'utilisation frauduleuse, ou de non-paiement de l'abonnement.
        </p>
      </Section>

      <Section title="3. Description du service">
        <p>NeoFlow BOS est une application de gestion commerciale proposant notamment :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Gestion des commandes, factures et devis</li>
          <li>Caisse de vente rapide (gestion interne)</li>
          <li>Gestion des stocks et des livraisons</li>
          <li>CRM clients et fournisseurs</li>
          <li>Tableaux de bord et statistiques</li>
          <li>Assistant IA intégré (Neo)</li>
          <li>Notifications push (PWA)</li>
        </ul>
        <p>
          L'Éditeur se réserve le droit de faire évoluer les fonctionnalités du service à tout moment, sans préavis,
          dans la limite du maintien des fonctionnalités essentielles souscrites.
        </p>
      </Section>

      <Section title="4. Obligations de l'utilisateur">
        <p>L'utilisateur s'engage à :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Fournir des informations exactes lors de l'inscription</li>
          <li>Ne pas utiliser le service à des fins illicites ou frauduleuses</li>
          <li>Ne pas tenter d'accéder aux données d'autres workspaces</li>
          <li>Ne pas transmettre ses identifiants à des tiers non autorisés</li>
          <li>Respecter les lois applicables, notamment fiscales (art. 286 bis CGI le cas échéant)</li>
          <li>Ne pas introduire de virus, malwares ou codes malveillants dans le système</li>
        </ul>
      </Section>

      <Section title="5. Propriété intellectuelle">
        <p>
          L'ensemble des éléments constituant NeoFlow BOS (code source, interface, logo, marque, documentation)
          est la propriété exclusive de Neoflow Agency et est protégé par le droit de la propriété intellectuelle.
          Toute reproduction, adaptation ou exploitation non autorisée est interdite et constitue une contrefaçon.
        </p>
        <p>
          Les données saisies par l'utilisateur dans l'application restent sa propriété exclusive.
        </p>
      </Section>

      <Section title="6. Disponibilité du service">
        <p>
          L'Éditeur s'efforce d'assurer une disponibilité maximale du service. Toutefois, des interruptions peuvent
          survenir pour maintenance, mises à jour ou incidents techniques. L'Éditeur ne saurait être tenu responsable
          de toute indisponibilité temporaire.
        </p>
        <p>
          En cas d'indisponibilité prolongée (supérieure à 72 heures consécutives imputable à l'Éditeur), une
          compensation sous forme de prorogation d'abonnement pourra être accordée sur demande.
        </p>
      </Section>

      <Section title="7. Limitation de responsabilité">
        <p>
          L'Éditeur ne saurait être tenu responsable de tout dommage indirect résultant de l'utilisation du service,
          notamment perte de données, manque à gagner ou préjudice commercial. La responsabilité de l'Éditeur est
          limitée au montant des sommes effectivement versées par l'utilisateur au cours des 3 derniers mois.
        </p>
        <p>
          L'utilisateur est seul responsable du respect de ses obligations légales, fiscales et comptables, notamment
          celles relatives à l'enregistrement des encaissements (art. 286 bis CGI, certification NF 525).
        </p>
      </Section>

      <Section title="8. Modification des CGU">
        <p>
          L'Éditeur se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront
          informés par email avec un préavis de 30 jours. L'utilisation continue du service après ce délai vaut
          acceptation des nouvelles CGU.
        </p>
      </Section>

      <Section title="9. Résiliation">
        <p>
          L'utilisateur peut résilier son compte à tout moment depuis les paramètres de l'application ou en
          contactant le support. La résiliation prend effet à la fin de la période d'abonnement en cours.
          Les données sont conservées 30 jours après résiliation puis supprimées définitivement.
        </p>
      </Section>

      <Section title="10. Droit applicable">
        <p>
          Les présentes CGU sont soumises au droit français. En cas de litige, et à défaut de résolution amiable,
          les tribunaux français compétents seront saisis.
        </p>
      </Section>
    </div>
  )
}

function TabCGV() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Dernière mise à jour : mars 2025</p>

      <Section title="1. Objet">
        <p>
          Les présentes Conditions Générales de Vente (CGV) régissent les relations contractuelles entre
          Neoflow Agency et tout client souscrivant à l'abonnement NeoFlow BOS. Toute souscription implique
          l'acceptation sans réserve des présentes CGV.
        </p>
      </Section>

      <Section title="2. Prix et abonnement">
        <p>
          NeoFlow BOS est proposé en abonnement mensuel au tarif de <strong>49 € TTC / mois</strong>
          {' '}ou en abonnement annuel au tarif de <strong>490 € TTC / an</strong>, soit l'équivalent de
          40,83 € / mois. Les prix sont indiqués toutes taxes comprises (TVA 20 % incluse).
        </p>
        <p>
          L'Éditeur se réserve le droit de modifier ses tarifs avec un préavis de 30 jours. Le client sera
          informé par email et pourra résilier avant l'entrée en vigueur de la nouvelle tarification.
        </p>
      </Section>

      <Section title="3. Période d'essai gratuite">
        <p>
          Tout nouveau workspace bénéficie d'une période d'essai gratuite de <strong>7 jours</strong>.
          Une carte bancaire valide est requise à l'activation. Aucun débit n'est effectué pendant la période d'essai.
          À l'issue de cette période, l'abonnement est automatiquement activé et le premier paiement est prélevé,
          sauf résiliation avant la fin de la période d'essai.
        </p>
      </Section>

      <Section title="4. Facturation et paiement">
        <p>
          La facturation est effectuée en début de chaque période (mensuelle ou annuelle) via la plateforme
          Stripe. Les moyens de paiement acceptés sont les cartes bancaires (Visa, Mastercard, American Express).
        </p>
        <p>
          En cas d'échec de paiement, une période de grâce de 3 jours est accordée. Passé ce délai, l'accès au
          workspace est suspendu jusqu'à régularisation. Le client peut mettre à jour ses informations de paiement
          depuis le portail Stripe accessible dans les paramètres de l'application.
        </p>
      </Section>

      <Section title="5. Renouvellement automatique">
        <p>
          L'abonnement est renouvelé automatiquement à chaque échéance, sauf résiliation préalable. Le client
          reçoit une notification par email avant chaque renouvellement annuel.
        </p>
      </Section>

      <Section title="6. Résiliation">
        <p>
          Le client peut résilier son abonnement à tout moment depuis les paramètres (Paramètres {'>'} Abonnement {'>'}{' '}
          Gérer l'abonnement) ou en contactant{' '}
          <a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">
            contacte.neoflowagency@gmail.com
          </a>.
        </p>
        <p>
          La résiliation prend effet à la fin de la période en cours. <strong>Aucun remboursement prorata
          n'est effectué</strong> pour la période déjà facturée, sauf cas de force majeure ou faute exclusive
          de l'Éditeur.
        </p>
      </Section>

      <Section title="7. Droit de rétractation — Renonciation expresse">
        <p>
          Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation de 14 jours
          ne peut s'appliquer aux contrats de fourniture de services pleinement exécutés avant la fin du délai
          de rétractation, avec l'accord préalable exprès du consommateur.
        </p>
        <p>
          <strong>En acceptant les présentes CGV lors de l'inscription, le client reconnaît expressément
          avoir demandé l'exécution immédiate du contrat et renonce à son droit de rétractation dès que
          le service aura commencé à être fourni.</strong> La période d'essai de 7 jours est accordée
          indépendamment de ce mécanisme légal.
        </p>
        <p>
          Cette renonciation ne concerne pas les clients personnes physiques agissant dans le cadre d'une
          activité professionnelle (B2B), qui ne bénéficient pas du droit de rétractation légal.
        </p>
      </Section>

      <Section title="8. Suspension et résiliation pour cause">
        <p>
          L'Éditeur se réserve le droit de suspendre ou résilier immédiatement l'accès en cas de :
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Non-paiement au-delà de la période de grâce de 3 jours</li>
          <li>Violation des CGU (utilisation frauduleuse, atteinte aux systèmes, etc.)</li>
          <li>Utilisation du service à des fins illicites</li>
        </ul>
      </Section>

      <Section title="9. Limitation de responsabilité">
        <p>
          NeoFlow BOS est fourni en l'état. L'Éditeur ne garantit pas que le service sera exempt d'erreurs
          ou adapté à un usage spécifique. La responsabilité de l'Éditeur est limitée au montant des
          abonnements perçus au cours des 3 derniers mois précédant le litige.
        </p>
        <p>
          Le client est seul responsable de la conformité de son utilisation aux obligations légales
          applicables à son activité, notamment en matière de logiciel de caisse certifié (art. 286 bis CGI).
        </p>
      </Section>

      <Section title="10. Droit applicable et litiges">
        <p>
          Les présentes CGV sont régies par le droit français. Tout litige sera soumis, après tentative de
          résolution amiable, aux tribunaux compétents du ressort du siège social de l'Éditeur.
        </p>
        <p>
          Conformément aux articles L611-1 et suivants du Code de la consommation, le client consommateur
          peut recourir gratuitement au service de médiation compétent en cas de litige non résolu.
        </p>
      </Section>
    </div>
  )
}

function TabConfidentialite() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Dernière mise à jour : mars 2025</p>

      <Section title="1. Responsable du traitement">
        <p>
          Le responsable du traitement des données personnelles collectées via NeoFlow BOS est{' '}
          <strong>Neoflow Agency</strong>, joignable à l'adresse :{' '}
          <a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">
            contacte.neoflowagency@gmail.com
          </a>.
        </p>
      </Section>

      <Section title="2. Données collectées et finalités">
        <p>NeoFlow BOS collecte et traite les données personnelles suivantes :</p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Données</th>
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Finalité</th>
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Base légale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-3 py-2">Nom, email, mot de passe</td>
                <td className="border border-gray-200 px-3 py-2">Création et gestion du compte</td>
                <td className="border border-gray-200 px-3 py-2">Exécution du contrat</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-3 py-2">Données workspace (SIRET, IBAN, adresse)</td>
                <td className="border border-gray-200 px-3 py-2">Génération des documents commerciaux</td>
                <td className="border border-gray-200 px-3 py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-3 py-2">Données clients/commandes/factures</td>
                <td className="border border-gray-200 px-3 py-2">Fonctionnement du service de gestion</td>
                <td className="border border-gray-200 px-3 py-2">Exécution du contrat</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-3 py-2">Données de paiement (Stripe)</td>
                <td className="border border-gray-200 px-3 py-2">Facturation abonnement</td>
                <td className="border border-gray-200 px-3 py-2">Exécution du contrat</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-3 py-2">Logs de connexion, IP</td>
                <td className="border border-gray-200 px-3 py-2">Sécurité, prévention de la fraude</td>
                <td className="border border-gray-200 px-3 py-2">Intérêt légitime</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-3 py-2">Notifications push</td>
                <td className="border border-gray-200 px-3 py-2">Alertes métier temps réel</td>
                <td className="border border-gray-200 px-3 py-2">Consentement</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="3. Sous-traitants et destinataires">
        <p>
          Vos données peuvent être transmises aux sous-traitants suivants, dans le strict cadre de la
          fourniture du service :
        </p>
        <ul className="space-y-2 mt-2">
          <li className="bg-gray-50 rounded-lg p-3">
            <strong>Supabase Inc.</strong> — Base de données et authentification. Serveurs en Europe (UE) et Singapour.
            Garanties : Clauses Contractuelles Types (CCT) de la Commission européenne.
          </li>
          <li className="bg-gray-50 rounded-lg p-3">
            <strong>Vercel Inc.</strong> — Hébergement de l'application. Serveurs aux États-Unis.
            Garanties : CCT de la Commission européenne. Certifié DPF (Data Privacy Framework).
          </li>
          <li className="bg-gray-50 rounded-lg p-3">
            <strong>Stripe Inc.</strong> — Traitement des paiements. Serveurs aux États-Unis.
            Garanties : CCT. Certifié PCI-DSS niveau 1. Certifié DPF.
          </li>
          <li className="bg-gray-50 rounded-lg p-3">
            <strong>Resend</strong> — Envoi d'emails transactionnels. Garanties : CCT.
          </li>
        </ul>
        <p className="text-xs text-gray-500 mt-2">
          Ces transferts hors de l'Union européenne sont encadrés par les Clauses Contractuelles Types adoptées
          par la Commission européenne conformément à l'article 46 du RGPD.
        </p>
      </Section>

      <Section title="4. Durée de conservation">
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Données de compte :</strong> durée de l'abonnement + 30 jours après résiliation</li>
          <li><strong>Données de facturation :</strong> 10 ans (obligation légale comptable)</li>
          <li><strong>Logs de connexion :</strong> 12 mois</li>
          <li><strong>Données supprimées par l'utilisateur :</strong> effacement immédiat ou dans un délai de 30 jours</li>
          <li><strong>Sauvegardes :</strong> jusqu'à 30 jours après suppression</li>
        </ul>
      </Section>

      <Section title="5. Vos droits (RGPD)">
        <p>Conformément au RGPD (art. 15 à 22), vous disposez des droits suivants :</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Droit d'accès :</strong> obtenir une copie de vos données</li>
          <li><strong>Droit de rectification :</strong> corriger des données inexactes</li>
          <li><strong>Droit à l'effacement :</strong> supprimer votre compte depuis les paramètres</li>
          <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré</li>
          <li><strong>Droit d'opposition :</strong> vous opposer à certains traitements fondés sur l'intérêt légitime</li>
          <li><strong>Droit à la limitation :</strong> restreindre temporairement un traitement</li>
        </ul>
        <p className="mt-2">
          Pour exercer vos droits, contactez-nous à :{' '}
          <a href="mailto:contacte.neoflowagency@gmail.com" className="text-[#313ADF] hover:underline">
            contacte.neoflowagency@gmail.com
          </a>. Réponse sous 30 jours.
        </p>
        <p className="mt-2">
          Vous pouvez également déposer une réclamation auprès de la{' '}
          <strong>CNIL</strong> (Commission Nationale de l'Informatique et des Libertés) :{' '}
          <span className="font-medium">www.cnil.fr</span> — 3, place de Fontenoy, TSA 80715, 75334 Paris Cedex 07.
        </p>
      </Section>

      <Section title="6. Sécurité des données">
        <p>
          Neoflow Agency met en œuvre des mesures techniques et organisationnelles appropriées pour protéger
          vos données : chiffrement en transit (TLS), chiffrement au repos, contrôle d'accès basé sur les rôles
          (RBAC), Row Level Security (RLS) au niveau de la base de données, authentification sécurisée.
        </p>
      </Section>

      <Section title="7. Modifications">
        <p>
          La présente politique de confidentialité peut être mise à jour. Toute modification substantielle
          vous sera communiquée par email avec un préavis de 30 jours.
        </p>
      </Section>
    </div>
  )
}

function TabCookies() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">Dernière mise à jour : mars 2025</p>

      <Section title="1. Qu'est-ce qu'un cookie ?">
        <p>
          Un cookie est un petit fichier texte déposé sur votre navigateur lors de la visite d'un site web.
          Il permet de mémoriser des informations relatives à votre navigation.
        </p>
      </Section>

      <Section title="2. Cookies utilisés par NeoFlow BOS">
        <p>NeoFlow BOS utilise <strong>uniquement des cookies techniques strictement nécessaires</strong> au
          fonctionnement du service. Aucun cookie publicitaire, de tracking ou d'analyse n'est utilisé.</p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Cookie</th>
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Émetteur</th>
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Finalité</th>
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">Durée</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-3 py-2">sb-auth-token</td>
                <td className="border border-gray-200 px-3 py-2">Supabase</td>
                <td className="border border-gray-200 px-3 py-2">Session d'authentification</td>
                <td className="border border-gray-200 px-3 py-2">Session</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-3 py-2">neoflow-*</td>
                <td className="border border-gray-200 px-3 py-2">NeoFlow BOS</td>
                <td className="border border-gray-200 px-3 py-2">Préférences utilisateur (workspace actif, thème)</td>
                <td className="border border-gray-200 px-3 py-2">Persistant</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="3. Pas de consentement requis">
        <p>
          Conformément à la recommandation de la CNIL, les cookies strictement nécessaires au fonctionnement
          d'un service en ligne ne requièrent pas de consentement préalable. C'est pourquoi NeoFlow BOS
          n'affiche pas de bandeau cookies : seuls ces cookies techniques sont utilisés.
        </p>
      </Section>

      <Section title="4. Désactivation des cookies">
        <p>
          Vous pouvez désactiver les cookies dans les paramètres de votre navigateur. Attention : la désactivation
          des cookies techniques rendra l'accès à NeoFlow BOS impossible (authentification requise).
        </p>
      </Section>

      <Section title="5. Stockage local (localStorage)">
        <p>
          NeoFlow BOS utilise également le stockage local du navigateur (localStorage) pour mémoriser des
          préférences de navigation (historique du chat IA, état des modals). Ces données ne sont pas transmises
          à des serveurs tiers et restent uniquement sur votre appareil.
        </p>
      </Section>
    </div>
  )
}

export default function CGU() {
  const [activeTab, setActiveTab] = useState('cgu')

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

        <div className="bg-white border-2 border-[#040741] rounded-3xl shadow-xl overflow-hidden">
          {/* Title */}
          <div className="px-6 md:px-10 pt-8 pb-4">
            <h1 className="text-2xl md:text-3xl font-bold text-[#040741]">Conditions légales</h1>
            <p className="text-gray-500 text-sm mt-1">NeoFlow BOS — Neoflow Agency</p>
          </div>

          {/* Tabs */}
          <div className="px-6 md:px-10">
            <div className="flex gap-1 border-b border-gray-200">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-[#313ADF] border-b-2 border-[#313ADF] -mb-px'
                      : 'text-gray-500 hover:text-[#040741]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 md:px-10 py-8">
            {activeTab === 'cgu' && <TabCGU />}
            {activeTab === 'cgv' && <TabCGV />}
            {activeTab === 'confidentialite' && <TabConfidentialite />}
            {activeTab === 'cookies' && <TabCookies />}
          </div>
        </div>

        <p className="mt-8 text-gray-400 text-sm text-center">
          Propulsé par Neoflow Agency · <Link to="/mentions-legales" className="hover:text-[#313ADF] transition-colors">Mentions légales</Link>
        </p>
      </div>
    </div>
  )
}
