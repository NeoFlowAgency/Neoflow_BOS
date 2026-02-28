# NeoFlow BOS

## Architecture

**Stack** : React 19 + Vite 7 + Supabase + Tailwind CSS v4

- **Frontend** : SPA React (pas de SSR), routage via React Router 7
- **Backend** : Supabase (auth, database PostgreSQL, RLS policies, Edge Functions Deno)
- **Paiement** : Stripe (subscriptions, webhooks, Customer Portal)
- **Styling** : Tailwind CSS avec palette custom (#313ADF primary, #040741 dark navy)
- **Charts** : Recharts pour les graphiques dashboard

## Structure des fichiers

```
src/
├── components/
│   ├── ui/                    # Composants UI réutilisables
│   │   ├── BackgroundPattern.jsx   # Pattern décoratif pages auth
│   │   ├── PhoneInput.jsx          # Input téléphone avec indicatifs
│   │   └── ToggleButton.jsx        # Bouton bascule (remise %, €)
│   ├── BugReportForm.jsx     # Formulaire signalement bugs
│   └── Sidebar.jsx            # Navigation latérale principale
├── contexts/
│   ├── WorkspaceContext.jsx   # Gestion workspace multi-tenant + roles + subscription
│   └── ToastContext.jsx       # Notifications toast
├── lib/
│   ├── supabase.js            # Client Supabase (via env vars)
│   └── errorMessages.js       # Traduction erreurs EN→FR
├── pages/
│   ├── Login.jsx              # Connexion
│   ├── Signup.jsx             # Inscription
│   ├── ResetPassword.jsx      # Reset mdp
│   ├── MentionsLegales.jsx    # Page mentions légales publique
│   ├── Dashboard.jsx          # Accueil avec KPIs
│   ├── DashboardFinancier.jsx # Stats: CA, produits, vendeurs, charts
│   ├── CreerFacture.jsx       # Création facture
│   ├── CreerDevis.jsx         # Création devis
│   ├── ApercuFacture.jsx      # Aperçu facture + actions
│   ├── ApercuDevis.jsx        # Aperçu devis + actions
│   ├── ListeFactures.jsx      # Liste factures
│   ├── ListeDevis.jsx         # Liste devis
│   ├── ListeClients.jsx       # CRM: liste clients
│   ├── FicheClient.jsx        # CRM: fiche client
│   ├── Produits.jsx           # CRUD produits
│   ├── Livraisons.jsx         # Gestion livraisons
│   ├── Settings.jsx           # Paramètres (Compte, Workspace, Abonnement, Support)
│   ├── WorkspaceOnboarding.jsx # Création workspace + redirect Stripe Checkout
│   ├── WorkspaceSuspended.jsx  # Page workspace suspendu/incomplet
│   └── JoinWorkspace.jsx       # Acceptation invitation par token
├── services/
│   ├── workspaceService.js    # CRUD workspace + Stripe checkout/portal
│   └── invitationService.js   # CRUD invitations par token
└── main.jsx                   # Point d'entrée

supabase/functions/
├── create-checkout/           # Crée Stripe Checkout Session (7j trial)
├── stripe-webhook/            # Gère webhooks Stripe (5 events)
├── create-portal-session/     # Crée Stripe Customer Portal session
├── accept-invitation/         # Accepte invitation par token hashé
├── delete-account/            # Suppression RGPD (transfert/delete workspace)
├── generate-pdf/              # Génération PDF factures/devis
└── send-email/                # Envoi emails via Resend

sql/
├── v3_001_roles_migration.sql     # Migration roles owner/manager/member
├── v3_002_subscription_columns.sql # Colonnes Stripe sur workspaces
├── v3_003_invitations_table.sql   # Table invitations + RLS
├── v3_004_rls_and_triggers.sql    # RLS updates + trigger unicité owner
└── v3_005_cron_jobs.sql           # pg_cron: suspension auto, cleanup
```

## Flux authentification

1. **Login** → `supabase.auth.signInWithPassword()`
2. **Signup** → `supabase.auth.signUp()` avec `user_metadata.full_name`
3. **Reset password** → Supabase email + token, écoute `PASSWORD_RECOVERY` event
4. **Protection routes** → `ProtectedRoute` vérifie session + workspace actif
5. **Suspension** → Workspace `is_active=false` → redirect `/workspace/suspended`
6. **Logout** → Depuis Settings (`supabase.auth.signOut()`)

## Multi-tenant (Workspaces)

- Chaque utilisateur appartient à 1+ workspaces via `workspace_users`
- `WorkspaceContext` expose: `currentWorkspace`, `isOwner`, `isAdmin`, `isActive`, `subscriptionStatus`
- Toutes les queries filtrent par `workspace_id`
- Switch workspace disponible dans Settings

## Rôles

| Rôle | Droits |
|------|--------|
| **owner** | Tout: gestion abonnement, rôles, invitations, suppression workspace |
| **admin** | Edit workspace info, invitations, gestion membres (sauf owner) |
| **member** | Lecture/écriture données métier (factures, devis, clients) |

- Un seul owner par workspace (enforced par trigger SQL `enforce_single_owner`)
- Le créateur du workspace est automatiquement owner

## Abonnement Stripe

### Flow création workspace
1. User remplit formulaire → `createWorkspace()` (status=incomplete, is_active=false)
2. → `createCheckoutSession()` → redirect Stripe Checkout
3. Stripe Checkout: 49,99 EUR/mois, 7j trial, CB requise
4. Webhook `checkout.session.completed` → status=trialing, is_active=true
5. Redirect `/dashboard?checkout=success`

### Webhooks gérés
- `checkout.session.completed` → trialing + active
- `invoice.paid` → active + clear grace period
- `invoice.payment_failed` → past_due + grace 3 jours
- `customer.subscription.updated` → sync status
- `customer.subscription.deleted` → canceled + inactive

### Suspension automatique (pg_cron)
- Toutes les 6h: suspend workspaces past_due dont grace_period dépassée
- Daily 4h: supprime workspaces incomplete > 24h (checkout abandonné)
- Daily 3h: nettoie invitations expirées > 30 jours

### Portail facturation
- Owner peut accéder au Stripe Customer Portal depuis Settings > Abonnement
- Modifier CB, annuler, réactiver

## Invitations par token

1. Owner/Admin génère invitation (Settings > Workspace > Inviter)
2. Token UUID → hashé SHA-256 → stocké en DB
3. URL: `/join?token=xxx` envoyée au nouveau membre
4. Edge Function `accept-invitation` vérifie token, expiry, email, workspace actif
5. User rejoint avec le rôle défini dans l'invitation
6. Invitations expirent après 7 jours

## Suppression RGPD

- Edge Function `delete-account` (2 étapes)
- Si owner: choix transférer propriété ou supprimer workspace
- Transfert: change owner dans workspace_users + workspaces.owner_user_id
- Suppression: annule Stripe subscription, désactive workspace
- Soft-delete profil (full_name → '[Compte supprimé]', deleted_at)
- Supprime auth user via `supabase.auth.admin.deleteUser()`

## RLS (Row Level Security)

- Tables données (`invoices`, `quotes`, `customers`, `products`, `deliveries`, `jobs`, etc.): SELECT/INSERT/UPDATE filtré par workspace_id via workspace_users
- `workspaces`: UPDATE par owner+manager, DELETE par owner uniquement
- `workspace_invitations`: SELECT/INSERT/DELETE par owner+manager
- `workspace_users`: contrainte CHECK role IN ('owner', 'manager', 'member')

## Variables d'environnement

### Frontend (.env)
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
```

### Supabase Secrets (Edge Functions)
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxx
supabase secrets set STRIPE_PRICE_ID=price_xxxxx
```

## Déploiement Edge Functions

```bash
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy create-portal-session --no-verify-jwt
supabase functions deploy accept-invitation --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt
```

**IMPORTANT** : Toutes les fonctions doivent être déployées avec `--no-verify-jwt`. Elles gèrent l'auth en interne via `supabase.auth.getUser(token)`. Sans ce flag, la Gateway Supabase bloque les requêtes avec "Invalid JWT" avant que la fonction s'exécute.

## SQL Migrations (V3)

Exécuter dans l'ordre dans le SQL Editor Supabase :
1. `sql/v3_001_roles_migration.sql` - Migration roles
2. `sql/v3_002_subscription_columns.sql` - Colonnes Stripe
3. `sql/v3_003_invitations_table.sql` - Table invitations
4. `sql/v3_004_rls_and_triggers.sql` - RLS + triggers
5. `sql/v3_005_cron_jobs.sql` - pg_cron (activer extension d'abord)

## Configuration Stripe

1. Créer compte Stripe (mode test)
2. Créer Product "NeoFlow BOS" - 49,99 EUR/mois recurring
3. Activer Customer Portal (update payment, cancel)
4. Webhook endpoint: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
5. Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
6. Configurer secrets Supabase (voir ci-dessus)

## Statut client (calculé côté front)

- **Prospect** : aucune facture payée
- **Actif** : facture payée dans les 6 derniers mois
- **Inactif** : factures payées mais aucune récente (>6 mois)
- **Prioritaire** : CA total >= 5000 EUR OU `is_priority = true`

## Points restants / modules suivants

- [ ] Tests unitaires et E2E
- [ ] Code splitting (lazy import des pages) pour réduire bundle size
- [ ] PWA / notifications push
- [ ] Export CSV des données (factures, clients)
- [ ] Mode hors-ligne / cache local
- [ ] Internationalisation (i18n)
