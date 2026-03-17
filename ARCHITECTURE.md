# Architecture — NeoFlow BOS

Document technique destine aux developpeurs rejoignant le projet. Couvre les choix techniques, la structure du code, les flux de donnees et les conventions en vigueur.

---

## Stack technique

| Couche | Technologie | Version | Raison du choix |
|--------|------------|---------|----------------|
| Frontend | React | 19 | Concurrent features, hooks modernes |
| Build | Vite | 7 | HMR rapide, ESM natif |
| Routing | React Router | 7 | Nested routes, loaders |
| Styling | Tailwind CSS | v4 | Utility-first, palette custom |
| Charts | Recharts | 3 | Compose facilement avec React |
| Backend/DB | Supabase | 2.x | Postgres + Auth + RLS + Storage |
| Edge Functions | Deno (Supabase) | - | Serverless TypeScript, pres de la DB |
| Paiement | Stripe | - | Subscriptions, webhooks, Customer Portal |
| Email | Resend | - | Livraison transactionnelle fiable |
| IA | OpenAI | - | NeoChat (assistant integre) |
| Workflows async | n8n | - | PDF, email, traitement factures/devis |

**Pas de TypeScript** — le projet est en JavaScript + JSX pur. Pas de SSR, c'est une SPA complete.

---

## Structure des dossiers

```
Neoflow_BOS/
├── src/
│   ├── App.jsx                     # Routeur principal + ProtectedRoute + Layout
│   ├── main.jsx                    # Point d'entree React
│   ├── components/
│   │   ├── ui/
│   │   │   ├── BackgroundPattern.jsx   # SVG decoratif pages auth
│   │   │   ├── PhoneInput.jsx          # Input tel avec indicatifs internationaux
│   │   │   ├── ToggleButton.jsx        # Bascule % / EUR (remises)
│   │   │   ├── ChartModal.jsx          # Modal plein ecran pour graphiques
│   │   │   └── SpotlightOverlay.jsx    # Overlay tutoriel (spotlight sur element)
│   │   ├── Sidebar.jsx             # Navigation principale (collapse/mobile)
│   │   ├── NeoChat.jsx             # Assistant IA (panneau lateral redimensionnable)
│   │   ├── OnboardingTour.jsx      # Tour guide interactif (etapes spotlight)
│   │   ├── WelcomeTutorial.jsx     # Modal de bienvenue (lancer/ignorer le tour)
│   │   ├── PaymentModal.jsx        # Modal saisie paiement partiel/total
│   │   ├── BugReportForm.jsx       # Formulaire signalement bug (envoie email)
│   │   └── NeoButton.jsx           # Bouton primaire reutilisable
│   ├── contexts/
│   │   ├── WorkspaceContext.jsx    # Etat global workspace, role, subscription
│   │   └── ToastContext.jsx        # Systeme de notifications toast global
│   ├── hooks/
│   │   └── usePermissions.js       # Hook derive de WorkspaceContext pour les droits
│   ├── lib/
│   │   ├── supabase.js             # Instance client Supabase (singleton)
│   │   ├── errorMessages.js        # Traduction erreurs Supabase EN -> FR
│   │   ├── permissions.js          # Matrice de permissions par role
│   │   └── earlyAccess.js          # Logique early access / liste d'attente
│   ├── pages/
│   │   ├── Login.jsx               # /login
│   │   ├── Signup.jsx              # /signup
│   │   ├── ResetPassword.jsx       # /reset-password
│   │   ├── MentionsLegales.jsx     # /mentions-legales (public)
│   │   ├── OnboardingSurvey.jsx    # /onboarding/survey
│   │   ├── WorkspaceChoice.jsx     # /onboarding/choice
│   │   ├── WorkspaceOnboarding.jsx # /onboarding/workspace + Stripe Checkout
│   │   ├── WorkspaceSuspended.jsx  # /workspace/suspended
│   │   ├── JoinWorkspace.jsx       # /join?token=xxx
│   │   ├── EarlyAccessWaiting.jsx  # Page liste d'attente
│   │   ├── Dashboard.jsx           # /dashboard — KPIs accueil
│   │   ├── DashboardFinancier.jsx  # /dashboard-financier — stats CA/produits
│   │   ├── AdminDashboard.jsx      # /admin — dashboard interne NeoFlow
│   │   ├── ListeFactures.jsx       # /factures
│   │   ├── CreerFacture.jsx        # /factures/nouvelle
│   │   ├── ApercuFacture.jsx       # /factures/:factureId
│   │   ├── ListeDevis.jsx          # /devis
│   │   ├── CreerDevis.jsx          # /devis/nouveau
│   │   ├── ApercuDevis.jsx         # /devis/:devisId
│   │   ├── ListeClients.jsx        # /clients
│   │   ├── FicheClient.jsx         # /clients/:clientId
│   │   ├── Produits.jsx            # /produits
│   │   ├── VenteRapide.jsx         # /vente-rapide
│   │   ├── CreerCommande.jsx       # /commandes/nouvelle
│   │   ├── ListeCommandes.jsx      # /commandes
│   │   ├── ApercuCommande.jsx      # /commandes/:commandeId
│   │   ├── Stock.jsx               # /stock
│   │   ├── StockLocations.jsx      # /stock/emplacements
│   │   ├── Fournisseurs.jsx        # /fournisseurs
│   │   ├── FicheFournisseur.jsx    # /fournisseurs/:fournisseurId
│   │   ├── CreerBonCommande.jsx    # /bons-commande/nouveau
│   │   ├── ApercuBonCommande.jsx   # /bons-commande/:bonCommandeId
│   │   ├── Livraisons.jsx          # /livraisons
│   │   ├── Documentation.jsx       # /documentation
│   │   ├── DocumentationAdmin.jsx  # /documentation/admin
│   │   └── Settings.jsx            # /settings (Compte, Workspace, Abonnement, Support)
│   └── services/
│       ├── workspaceService.js     # CRUD workspace + Stripe checkout/portal
│       ├── invitationService.js    # CRUD invitations par token
│       ├── invoiceService.js       # CRUD factures + paiements
│       ├── quoteService.js         # CRUD devis + conversion facture
│       ├── orderService.js         # CRUD commandes
│       ├── stockService.js         # Niveaux stock + emplacements + mouvements
│       ├── supplierService.js      # CRUD fournisseurs + bons de commande
│       ├── documentationService.js # CRUD articles documentation in-app
│       ├── onboardingService.js    # Etapes onboarding + completion
│       └── edgeFunctionService.js  # Appels generiques aux Edge Functions
├── supabase/
│   └── functions/
│       ├── create-checkout/        # Cree Stripe Checkout Session (trial 7j)
│       ├── stripe-webhook/         # Gere les 5 webhooks Stripe
│       ├── create-portal-session/  # Stripe Customer Portal
│       ├── accept-invitation/      # Valide token invitation + ajoute membre
│       ├── delete-account/         # Suppression RGPD
│       ├── generate-pdf/           # Rendu PDF (facture/devis)
│       ├── send-email/             # Envoi email via Resend
│       ├── verify-checkout/        # Verifie statut session Stripe post-paiement
│       ├── neo-chat/               # Backend NeoChat (appel OpenAI)
│       └── admin-data/             # Donnees agregees pour AdminDashboard
├── sql/                            # Migrations Supabase (a executer dans l'ordre)
├── n8n-workflows/                  # Workflows JSON n8n (import manuel)
└── public/
    └── logo-neoflow.png
```

---

## Architecture generale

```
Browser (React SPA)
        |
        |-- Supabase JS SDK (auth + database queries directs avec RLS)
        |
        |-- Supabase Edge Functions (Deno) <-- Stripe webhooks, PDF, email, IA
        |
        |-- n8n (self-hosted) <-- workflows async (traitement lourd)
```

Le frontend fait **deux types d'appels** :

1. **Directs via Supabase JS** (`supabase.from('table').select()...`) pour les lectures/ecritures CRUD simples. La securite est geree par les RLS policies PostgreSQL.

2. **Via Edge Functions** pour tout ce qui necessite des secrets server-side (Stripe, Resend, OpenAI) ou des operations privilegiees (suppression auth user, generation PDF).

---

## Gestion d'etat

Il n'y a **pas de Redux ni Zustand**. L'etat global est gere avec deux Context React :

### WorkspaceContext (`src/contexts/WorkspaceContext.jsx`)

C'est le contexte central. Il expose :

```js
{
  currentWorkspace,     // Workspace actif (objet complet)
  role,                 // Role de l'user dans ce workspace
  isOwner,              // role === 'proprietaire'
  isAdmin,              // role === 'proprietaire' || 'manager'
  isActive,             // currentWorkspace.is_active
  subscriptionStatus,   // 'trialing' | 'active' | 'past_due' | 'canceled' | ...
  loading,              // Chargement initial
  refreshWorkspace,     // Forcer un refresh depuis la DB
}
```

Toutes les pages consomment ce contexte. Ne jamais re-fetcher le workspace manuellement depuis une page — utiliser `refreshWorkspace()`.

### ToastContext (`src/contexts/ToastContext.jsx`)

Fournit `showToast(message, type)` disponible partout via `useToast()`.

---

## Systeme de roles

Deux systemes de roles coexistent (heritage de l'evolution du produit) :

### Roles metier (utilises dans App.jsx pour le routing)

| Role | Acces |
|------|-------|
| `proprietaire` | Tout |
| `manager` | Tout sauf admin NeoFlow |
| `vendeur` | Ventes, factures, devis, clients, stock lecture |
| `livreur` | Livraisons uniquement |

Ces roles sont stockes dans `workspace_users.role` en base.

### Guards de route (App.jsx)

```js
const BUSINESS_ROLES = ['proprietaire', 'manager', 'vendeur', 'livreur']
const SALES_ROLES    = ['proprietaire', 'manager', 'vendeur']
const MANAGEMENT_ROLES = ['proprietaire', 'manager']
```

`RoleGuard` verifie le role courant et redirige vers `/dashboard` si non autorise.

### Permissions granulaires (`src/lib/permissions.js`)

Pour les cas plus fins (ex: "peut supprimer une facture ?"), utiliser le hook `usePermissions()` qui lit `permissions.js`.

---

## Multi-tenant

- Chaque entite metier (facture, devis, client, produit, commande...) porte un `workspace_id`.
- Les RLS policies Postgres garantissent qu'un user ne peut lire que les donnees de ses workspaces.
- Un user peut appartenir a plusieurs workspaces. Le switch se fait dans Settings.
- Un seul `proprietaire` par workspace (enforce par trigger SQL `enforce_single_owner`).

**Pattern a suivre pour chaque query Supabase :**
```js
const { data } = await supabase
  .from('invoices')
  .select('*')
  .eq('workspace_id', currentWorkspace.id)  // TOUJOURS filtrer par workspace
```

---

## Flux Stripe (abonnement)

```
User remplit formulaire workspace
        |
        v
createWorkspace() --> status='incomplete', is_active=false
        |
        v
createCheckoutSession() [Edge Function] --> Stripe Checkout URL
        |
        v
User paie sur Stripe (49,99 EUR/mois, 7j trial gratuit)
        |
        v
Stripe envoie webhook checkout.session.completed
        |
        v
stripe-webhook [Edge Function] --> workspace.status='trialing', is_active=true
        |
        v
Redirect /dashboard?checkout=success
```

### Webhooks geres

| Event Stripe | Action en base |
|-------------|---------------|
| `checkout.session.completed` | status=trialing, is_active=true |
| `invoice.paid` | status=active, clear grace_period |
| `invoice.payment_failed` | status=past_due, grace_period=+3j |
| `customer.subscription.updated` | sync status |
| `customer.subscription.deleted` | status=canceled, is_active=false |

### Suspension automatique (pg_cron)

- Toutes les 6h : suspend workspaces `past_due` dont grace_period depassee
- Quotidien 4h : supprime workspaces `incomplete` > 24h (checkout abandonne)
- Quotidien 3h : nettoie invitations expirees > 30 jours

> Necessite l'extension `pg_cron` activee sur le projet Supabase.

---

## Workflows n8n (traitement asynchrone)

Les operations lourdes passent par n8n pour ne pas bloquer l'UI :

| Workflow | Declencheur | Action |
|----------|------------|--------|
| 1 - Job Processor | Webhook interne | Dispatch vers workers |
| 2 - Create Invoice Entry | Webhook | Valide et cree la facture |
| 3 - Process Create Invoice | Worker | Logique metier creation |
| 4 - Create Quote Entry | Webhook | Valide et cree le devis |
| 5 - Process Create Quote | Worker | Logique metier creation |
| 6 - Convert Quote to Invoice | Webhook | Conversion devis -> facture |
| 7 - Generate PDF | Worker | Appel Edge Function generate-pdf |
| 8 - Send Email | Worker | Appel Edge Function send-email |
| 9 - Send Payment Reminder | Scheduler | Relances automatiques |
| 10 - Process Stripe Payment | Webhook | Traitement paiement recu |
| 11 - Monitoring & Health Check | Cron | Sante des workflows |

Les fichiers JSON dans `n8n-workflows/` s'importent directement dans l'interface n8n.

---

## NeoChat (assistant IA)

- Composant `NeoChat.jsx` — panneau lateral droit, largeur redimensionnable (sauvegardee dans localStorage)
- Backend : Edge Function `neo-chat` — appelle OpenAI avec contexte workspace injecte
- Toggle via evenement custom `neoflow:open-neo` / `neoflow:close-neo` (dispatchEvent depuis n'importe quelle page)
- L'assistant a acces au contexte workspace pour repondre sur les donnees metier

---

## Onboarding utilisateur

Sequencement :

1. `OnboardingSurvey` — questions sur le metier/taille de l'equipe
2. `WorkspaceChoice` — creer un workspace ou rejoindre via invitation
3. `WorkspaceOnboarding` — formulaire workspace + redirect Stripe
4. A l'entree dans `/dashboard` : modal WelcomeTutorial propose le tour
5. `OnboardingTour` — etapes spotlight sur les elements cles de l'UI
6. Completion sauvegardee dans `profiles.tutorial_shown_at` (sync multi-appareils)

---

## Couleurs et design tokens

La palette est definie dans le CSS Tailwind (v4, config inline) :

| Token | Valeur | Usage |
|-------|--------|-------|
| Primary | `#313ADF` | Boutons, liens, accents |
| Dark navy | `#040741` | Textes titres, fonds sombres |
| White | `#FFFFFF` | Fond principal |
| Gray | Tailwind defaults | Secondaires, borders |

Pas de fichier `tailwind.config.js` — Tailwind v4 se configure directement dans le CSS via `@theme`.

---

## Securite

- **RLS Postgres** : toutes les tables metier ont des policies. Ne jamais desactiver RLS sur une table.
- **Edge Functions** : pas de JWT Gateway (`--no-verify-jwt`). Chaque fonction appelle `supabase.auth.getUser(token)` pour valider le token Bearer recu.
- **Secrets** : aucun secret dans le code frontend. Les cles Stripe/OpenAI/Resend sont exclusivement dans les Supabase Secrets.
- **Invitations** : token UUID hashe en SHA-256 avant stockage. Le token brut n'est jamais en base.
- **Admin interne** : acces `/admin` bypass le check workspace/Stripe. Emails hardcodes dans `App.jsx` (`ADMIN_EMAIL`, `DEV_EMAIL`).

---

## Conventions de code

- **Nommage fichiers** : PascalCase pour les composants/pages, camelCase pour services/lib/hooks
- **Langue** : UI en francais, code (variables, fonctions) en anglais/francais mixte (heritage du projet)
- **Services** : toute logique Supabase est dans `src/services/`. Les pages ne font pas de requetes directes — elles appellent les services.
- **Pas de tests** pour l'instant — priorite MVP
- **Pas de lazy loading** — toutes les pages sont importees statiquement dans `App.jsx` (a optimiser)

---

## Etat des migrations SQL

| Fichier | Contenu | Statut |
|---------|---------|--------|
| v3_001 | Roles owner/manager/member (ancienne nomenclature) | Applique |
| v3_002 | Colonnes Stripe sur workspaces | Applique |
| v3_003 | Table invitations + RLS | Applique |
| v3_004 | RLS updates + trigger unicite owner | Applique |
| v3_005 | pg_cron jobs | Applique |
| v4_001 | Roles metier + customisation workspace | Applique |
| v4_001 | Onboarding survey responses | Applique |
| v4_002 | Acomptes devis | Applique |
| v4_003 | Commandes etendues | Applique |
| v4_004 | Creneaux livraisons | Applique |
| v4_005 | Fix paiements | Applique |
| v4_006 | Settings workspace | Applique |
| v5_001 | Early access / liste attente | Applique |
| v6_001 | Foundation commandes (refonte) | Applique |
| v6_002 | Seed documentation in-app | Applique |

En cas de doute sur l'etat de la base, `FIX_ALL_SCHEMA.sql` reapplique le schema complet de facon idempotente.
