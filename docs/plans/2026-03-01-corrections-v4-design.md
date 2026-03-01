# NeoFlow BOS — Design v4 : 18 corrections & améliorations

**Date :** 2026-03-01
**Statut :** Approuvé
**Périmètre :** Onboarding, Stock/Ventes, Paiements, Livraisons, Clients, Neo IA, Settings

---

## THÈME 1 — Onboarding (items 1A, 1B, 2, 3)

### 1A — Survey post-signup (3 questions)

- Nouvelle page `src/pages/OnboardingSurvey.jsx`
- Route : `/onboarding/survey`, insérée entre Signup et WorkspaceChoice
- 3 questions à choix unique, une par écran (stepper animé) :
  1. « Comment avez-vous découvert NeoFlow BOS ? » → Réseaux sociaux / Bouche à oreille / Recherche web / Salon ou événement / Autre
  2. « Pourquoi NeoFlow BOS ? » → Gestion complète / Prix attractif / Interface simple / Recommandé / Autre
  3. « Votre principale attente ? » → Gérer mes ventes / Suivre mon stock / Gérer mes livraisons / Statistiques / Autre
- Stocké dans `profiles.onboarding_survey JSONB`
- Bouton "Passer" visible dès le départ (non obligatoire)
- Après envoi → redirect `/onboarding/choice`

### 1B — Workspace multi-step (5 étapes)

- Refactoring de `WorkspaceOnboarding.jsx` en stepper 5 étapes :
  - **Étape 1** : Infos générales (nom*, description, adresse*, ville*, CP*, pays, devise)
  - **Étape 2** : Infos légales (SIRET*, TVA, statut juridique*, IBAN, BIC, titulaire)
  - **Étape 3** : Personnalisation documents (logo, CGV, pied de page factures, pied de page devis)
  - **Étape 4** : Situation du magasin (nb employés, CA estimé, surface m², spécialité)
  - **Étape 5** : Abonnement → redirection Stripe Checkout
- Données persistées en mémoire jusqu'au submit final (step 5)
- Barre de progression visuelle, navigation Précédent/Suivant
- Étapes 3 et 4 entièrement optionnelles (bouton "Passer cette étape")

### 2 — Tutorial auto au premier login

- `profiles` : nouvelle colonne `tutorial_shown_at TIMESTAMPTZ`
- Dans `App.jsx` ProtectedRoute : si `tutorial_shown_at IS NULL` après chargement user → afficher modal de bienvenue qui propose de lancer le tutorial (`createTestData()` depuis `onboardingService.js`)
- Si l'utilisateur accepte ou décline → `UPDATE profiles SET tutorial_shown_at = NOW()`
- Déclenché sur chaque device, une seule fois par compte (flag serveur)

### 3 — Supprimer création workspace de la sidebar

- Supprimer le bouton "Nouveau workspace" du dropdown workspace switcher dans `Sidebar.jsx`
- Ajouter section "Créer un workspace" tout en bas de Settings > Workspace (accessible owner uniquement)

---

## THÈME 2 — Stock & Vente rapide (items 4, 5, 6)

### 4 & 6 — Alertes stock

- **À l'ajout** : si `available ≤ 3` → badge orange « ⚠️ Stock faible : X restant(s) »
- **À l'ajout** : si `available = 0` → modal rouge bloquant « Rupture de stock — impossible d'ajouter »
- **Après finalisation vente** : si un produit atteint `stock = 0` → toast persistant (5s) « [Produit] est maintenant en rupture de stock »
- Applicable dans VenteRapide.jsx

### 5 — Remises par produit

- `order_items.discount_item` et `order_items.discount_item_type` existent en base (non utilisées)
- Activer dans l'UI sur chaque ligne produit : toggle % / € + champ montant
- Calcul : `line_total = qty * unit_price * (1 - pct/100)` ou `qty * (unit_price - euro_discount)`
- Applicable dans VenteRapide, CreerCommande, CreerDevis (+ `quote_items`)
- La remise globale s'applique APRÈS les remises par ligne

---

## THÈME 3 — Type client pro/particulier (item 7)

- `customers.customer_type` VARCHAR('particulier'|'pro') existe déjà en base
- Dans CreerCommande et CreerDevis : toggle **Particulier / Professionnel** visible après sélection/création client
- Champs si "pro" : `company_name` (requis), `siret_client` (optionnel), `contact_name` (optionnel)
- Champs si "particulier" : formulaire actuel inchangé
- `FicheClient.jsx` : afficher badge type client + champs supplémentaires si pro

---

## THÈME 4 — Paiements (items 8, 9, 13)

### 8 — Acompte dans devis

- `quotes` : nouvelles colonnes `deposit_amount NUMERIC(12,2)`, `deposit_type VARCHAR('percent'|'euro')`
- Dans CreerDevis : section « Acompte demandé » avec toggle % / € + input
- Affichage live : si 30% → « = 450 € »
- Affiché dans ApercuDevis

### 9 — Modal paiement redessinée

- 3 options claires :
  - **Acompte** : pré-rempli avec `deposit_amount` de la commande (depuis le devis si applicable)
  - **Paiement partiel** : saisie libre
  - **Paiement total** : pré-rempli avec `remaining_amount`
- Retirer le type "solde" de l'UI (confusion) → remplacé par "Paiement total"
- Validation : montant saisi ≤ remaining_amount

### 13 — Bug : erreur paiement après conversion devis → commande

**Cause :** `payments.received_by` → FK vers `auth.users(id)`. La query Supabase tente `profiles!received_by` qui échoue (pas de FK vers `profiles`).

**Fix SQL :**
```sql
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_received_by_fkey,
  ADD CONSTRAINT payments_received_by_profiles_fk
    FOREIGN KEY (received_by) REFERENCES profiles(id);
```
PostgREST pourra alors résoudre la jointure `profiles!received_by`.

---

## THÈME 5 — Livraisons (items 10, 11, 15, 18)

### 10 — Créneaux multiples

- `deliveries` : nouvelle colonne `time_slots JSONB DEFAULT '[]'`
  - Format : `[{"date":"2026-03-10","start":"10:00","end":"13:00"}, {"date":"2026-03-15","start":"10:00","end":"20:00"}]`
- UI dans ApercuCommande > Planifier livraison : bouton "+ Ajouter un créneau"
- Chaque créneau : `<input type="date">` + `<input type="time">` début + `<input type="time">` fin
- Affichage : « Mardi 10 mars de 10h à 13h, ou samedi 15 mars de 10h à 20h »

### 11 — Transitions statut automatiques

- Nouveaux statuts dans `orders` : `'en_preparation'`, `'en_livraison'`
- Trigger dans enregistrement paiement :
  - Si `amount_paid >= deposit_amount` OU `remaining_amount = 0` → `status = 'en_preparation'`
- Bouton manuel « Passer en livraison » → `status = 'en_livraison'`
- Confirmation livraison dans Livraisons.jsx → `status = 'termine'`
- Workflow complet : `confirme → en_preparation → en_livraison → termine`

### 15 — Livraison semi-auto après paiement

- Après enregistrement paiement : si `requires_delivery = true` ET aucune livraison → créer `deliveries` en `status = 'a_planifier'` avec adresse client
- Toast : « Livraison créée automatiquement — planifiez les créneaux »
- La livraison reste modifiable

### 18 — Options livraison dans CreerCommande

- Si `delivery_type = 'delivery'` : section créneaux multi-slot + champ « Tarif livraison » (peut être 0)
  - Tarif pré-rempli avec `workspace_settings.delivery_fee_default`
- Si `delivery_type = 'pickup'` : champ date/heure « Disponible à partir du »
  - Stocké dans `orders.pickup_available_from TIMESTAMPTZ`

---

## THÈME 6 — Devis PDF (item 12)

- Supprimer bouton « Envoyer par email » dans `ApercuDevis.jsx`
- Remplacer `window.print()` par appel Edge Function `generate-pdf` :
  ```js
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf`, {...})
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `devis-${quote_ref}.pdf`; a.click()
  ```

---

## THÈME 7 — Clients doublons (item 14)

- Dans `ListeClients.jsx` lors de la création client : avant INSERT, `SELECT` par `email` ET `phone` dans le workspace
- Si doublon email → alerte non-bloquante : « Un client [Prénom Nom] existe déjà avec cet email. »
- Si doublon phone → alerte non-bloquante : « Un client [Prénom Nom] existe déjà avec ce numéro. »
- Lien direct vers la fiche du client existant
- L'utilisateur peut tout de même créer le client (choix conscient)

---

## THÈME 8 — Neo IA split pane redimensionnable (item 16)

- Neo passe de mode overlay à mode split pane
- `App.jsx` : état `neoWidth` (default 380px, min 280px, max 640px), persisté en localStorage
- `<main>` : `padding-right: neoWidth + 'px'` quand Neo ouvert (transition CSS 200ms)
- Panel Neo : position `fixed right-0`, width = `neoWidth`
- **Resize handle** : barre verticale 4px sur le bord gauche du panel (`cursor: col-resize`)
  - `mousedown` → écoute `mousemove` pour ajuster `neoWidth`, `mouseup` pour arrêter
- **Aucun backdrop ni blur** : l'app reste entièrement cliquable avec Neo ouvert
- Bouton Neo dans la sidebar/bottom nav ouvre/ferme (toggle)
- Mobile : comportement inchangé (panel plein écran)

---

## THÈME 9 — Settings enrichis (item 17)

- Nouveau tab **"Préférences"** dans Settings (entre Workspace et Abonnement)
- Sections :
  - **Livraisons** : tarif par défaut (€), zone de livraison (km max), mention obligatoire sur factures
  - **Paiements** : % acompte par défaut, délai de paiement (jours), modes de paiement actifs
  - **Numérotation** : préfixe commandes (`CMD-`), préfixe factures (`FA-`), préfixe devis (`DEV-`)
  - **Stock** : seuil alerte stock faible (défaut: 3), TVA par défaut (20%/10%/5.5%/0%)
- Stocké dans `workspaces.workspace_settings JSONB DEFAULT '{}'`

---

## SQL Migrations

```sql
-- Migration v4_001_onboarding.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tutorial_shown_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_survey JSONB;

-- Migration v4_002_quotes_deposit.sql
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(10) DEFAULT 'percent';

-- Migration v4_003_orders_extended.sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_available_from TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fees NUMERIC(12,2) DEFAULT 0;
-- Modifier le CHECK constraint sur status :
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('brouillon','confirme','en_preparation','en_livraison','livre','termine','annule'));

-- Migration v4_004_deliveries_timeslots.sql
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS time_slots JSONB DEFAULT '[]';

-- Migration v4_005_payments_fix.sql
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_received_by_fkey;
ALTER TABLE payments ADD CONSTRAINT payments_received_by_profiles_fk
  FOREIGN KEY (received_by) REFERENCES profiles(id);

-- Migration v4_006_workspace_settings.sql
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS workspace_settings JSONB DEFAULT '{}';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS nb_employes INTEGER;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ca_annuel_estime NUMERIC(12,2);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS surface_magasin INTEGER;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS specialite TEXT;
```

---

## Fichiers à créer / modifier

| Fichier | Action | Items couverts |
|---------|--------|----------------|
| `src/pages/OnboardingSurvey.jsx` | Créer | 1A |
| `src/pages/WorkspaceOnboarding.jsx` | Refactoring stepper | 1B |
| `src/App.jsx` | Tutorial auto + Neo split pane | 2, 16 |
| `src/components/Sidebar.jsx` | Supprimer "Nouveau workspace" | 3 |
| `src/pages/Settings.jsx` | Tab Préférences + création workspace | 3, 17 |
| `src/pages/VenteRapide.jsx` | Alertes stock + remises par produit | 4, 5, 6 |
| `src/pages/CreerCommande.jsx` | Type client + remises + options livraison | 5, 7, 18 |
| `src/pages/CreerDevis.jsx` | Type client + acompte + remises | 5, 7, 8 |
| `src/pages/ApercuCommande.jsx` | Paiement modal + statuts auto + créneaux + livraison auto | 9, 10, 11, 15 |
| `src/pages/ApercuDevis.jsx` | Suppr email + PDF réel | 12 |
| `src/pages/ListeClients.jsx` | Vérif doublons | 14 |
| `src/pages/Livraisons.jsx` | Statut → termine + créneaux | 10, 11 |
| `src/components/NeoChat.jsx` | Split pane + resize handle | 16 |
| `sql/v4_001_*.sql` à `v4_006_*.sql` | Créer | Toutes |
