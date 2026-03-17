# NeoFlow BOS

Business Operating System SaaS multi-tenant pour TPE/PME — gestion commerciale complète (factures, devis, commandes, CRM, stock, livraisons) avec abonnement Stripe et IA intégrée.

---

## Prerequis

| Outil | Version minimale |
|-------|-----------------|
| Node.js | 18+ |
| npm | 9+ |
| Supabase CLI | 1.x |
| Compte Supabase | (projet cree) |
| Compte Stripe | (mode test OK) |

---

## Installation locale

### 1. Cloner le depot et installer les dependances

```bash
git clone <url-du-repo> neoflow-bos
cd neoflow-bos
npm install
```

### 2. Configurer les variables d'environnement

Creer un fichier `.env` a la racine du projet :

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Ces valeurs se trouvent dans le dashboard Supabase (Settings > API) et le dashboard Stripe.

### 3. Appliquer les migrations SQL

Dans le SQL Editor de Supabase, executer les fichiers dans cet ordre :

```
sql/v3_001_roles_migration.sql
sql/v3_002_subscription_columns.sql
sql/v3_003_invitations_table.sql
sql/v3_004_rls_and_triggers.sql
sql/v3_005_cron_jobs.sql
sql/v4_001_roles_and_customization.sql
sql/v4_001_onboarding.sql
sql/v4_002_quotes_deposit.sql
sql/v4_003_orders_extended.sql
sql/v4_004_deliveries_timeslots.sql
sql/v4_005_payments_fix.sql
sql/v4_006_workspace_settings.sql
sql/v5_001_early_access.sql
sql/v6_001_orders_foundation.sql
sql/v6_002_documentation_seed.sql
```

> En cas de base vierge ou de doute, utiliser `sql/FIX_ALL_SCHEMA.sql` qui reapplique tout le schema complet.

### 4. Configurer les secrets des Edge Functions

```bash
supabase login
supabase link --project-ref <project-ref>

supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_ID=price_...
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set OPENAI_API_KEY=sk-...   # Pour NeoChat (IA)
```

### 5. Deployer les Edge Functions

```bash
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy create-portal-session --no-verify-jwt
supabase functions deploy accept-invitation --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt
supabase functions deploy generate-pdf --no-verify-jwt
supabase functions deploy send-email --no-verify-jwt
supabase functions deploy verify-checkout --no-verify-jwt
supabase functions deploy neo-chat --no-verify-jwt
supabase functions deploy admin-data --no-verify-jwt
```

> **Important** : le flag `--no-verify-jwt` est obligatoire. Les fonctions gerent l'auth en interne via `supabase.auth.getUser()`. Sans ce flag, la Gateway Supabase bloque les requetes avant execution.

### 6. Configurer Stripe

1. Creer un produit "NeoFlow BOS" — 49,99 EUR/mois recurring
2. Activer le Customer Portal (Billing > Customer portal)
3. Ajouter un webhook endpoint :
   - URL : `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events : `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`

### 7. Lancer le serveur de developpement

```bash
npm run dev
```

L'app est accessible sur `http://localhost:5173`.

---

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de developpement Vite (HMR) |
| `npm run build` | Build de production |
| `npm run preview` | Preview du build de production |
| `npm run lint` | ESLint |

---

## Flux d'onboarding utilisateur

1. Inscription (`/signup`) → survey (`/onboarding/survey`)
2. Choix workspace (`/onboarding/choice`) → creer ou rejoindre
3. Creation workspace (`/onboarding/workspace`) → redirect Stripe Checkout
4. Paiement Stripe (7 jours trial, CB requise) → webhook active le workspace
5. Redirect `/dashboard?checkout=success` → tutoriel interactif propose

---

## Etat du projet (mars 2026)

### Modules fonctionnels

- [x] Auth (connexion, inscription, reset mot de passe)
- [x] Multi-tenant avec roles (proprietaire, manager, vendeur, livreur)
- [x] Abonnement Stripe (trial 7j, webhooks, Customer Portal)
- [x] Invitations par token
- [x] CRM Clients (liste, fiche, statut prospect/actif/inactif/prioritaire)
- [x] Factures (creation, apercu, PDF, envoi email, paiements partiels)
- [x] Devis (creation, apercu, PDF, conversion en facture, acomptes)
- [x] Commandes (vente rapide, creation, suivi, livraisons)
- [x] Stock (niveaux, emplacements, alertes seuil)
- [x] Fournisseurs + bons de commande
- [x] Livraisons (planning, creneaux, suivi)
- [x] Dashboard financier (KPIs, charts CA, produits, vendeurs)
- [x] NeoChat (assistant IA integre, sidebar redimensionnable)
- [x] Onboarding interactif (tour guide)
- [x] Documentation in-app (admin peut editer)
- [x] Suppression RGPD (delete-account)
- [x] Admin dashboard interne

### Reste a faire

- [ ] Tests unitaires et E2E
- [ ] Code splitting (lazy import des pages) — bundle actuellement charge en entier
- [ ] PWA / notifications push
- [ ] Export CSV (factures, clients, stock)
- [ ] Mode hors-ligne / cache local
- [ ] Internationalisation (i18n)
- [ ] TypeScript (projet en JS pur pour l'instant)

### Bugs connus

- Le README.md avait un conflit git non resolu (corrige)
- Pas de gestion du rate-limiting sur les Edge Functions
- NeoChat necessite une cle OpenAI valide — plante silencieusement si absente
- `pg_cron` doit etre active manuellement dans les extensions Supabase avant d'executer `v3_005_cron_jobs.sql`
- Le `package.json` contient encore l'ancien nom `mvp-maison-de-la-literie-v1` (vestige du MVP initial)

---

## Variables d'environnement — recap complet

### Frontend (`.env`)

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_STRIPE_PUBLISHABLE_KEY=
```

### Supabase Secrets (Edge Functions)

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID
RESEND_API_KEY
OPENAI_API_KEY
```

---

## Contacts / Acces

- Supabase dashboard : partage via Settings > Team
- Stripe dashboard : partage via Settings > Team
- Admin interne : `neoflowagency05@gmail.com` (bypass Stripe, acces `/admin`)
